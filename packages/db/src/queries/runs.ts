import { and, desc, eq, inArray, lt, max, sql } from "drizzle-orm";
import type { Database } from "../client";
import { agents, runs, type RunError } from "../schema";

type RunTrigger = "schedule" | "manual" | "cli";

/** Insert a queued run. Returns null if the agent already has a queued or running run. */
export async function enqueueRun(db: Database, agentId: string, trigger: RunTrigger, requestedBy?: string) {
  const [row] = await db
    .insert(runs)
    .values({ agentId, trigger, requestedBy: requestedBy ?? null, status: "queued" })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Queue a run for every enabled agent whose interval has elapsed since its last run was queued. */
export async function scheduleDueRuns(db: Database, now = new Date()) {
  const last = db
    .select({ agentId: runs.agentId, lastQueuedAt: max(runs.queuedAt).as("last_queued_at") })
    .from(runs)
    .groupBy(runs.agentId)
    .as("last");
  const due = await db
    .select({ id: agents.id, interval: agents.scheduleIntervalMinutes, lastQueuedAt: last.lastQueuedAt })
    .from(agents)
    .leftJoin(last, eq(last.agentId, agents.id))
    .where(eq(agents.enabled, true));

  const queued = [];
  for (const a of due) {
    const lastAt = a.lastQueuedAt ? new Date(a.lastQueuedAt) : null;
    if (lastAt && now.getTime() - lastAt.getTime() < a.interval * 60_000) continue;
    const run = await enqueueRun(db, a.id, "schedule");
    if (run) queued.push(run);
  }
  return queued;
}

/** Atomically claim the oldest queued run. Safe with several workers (SKIP LOCKED). */
export async function claimNextRun(db: Database, now = new Date()) {
  const next = db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.status, "queued"))
    .orderBy(runs.queuedAt)
    .limit(1)
    .for("update", { skipLocked: true });
  const [row] = await db
    .update(runs)
    .set({ status: "running", startedAt: now, heartbeatAt: now })
    .where(and(inArray(runs.id, next), eq(runs.status, "queued")))
    .returning();
  return row ?? null;
}

export async function heartbeatRun(db: Database, runId: string) {
  await db.update(runs).set({ heartbeatAt: new Date() }).where(eq(runs.id, runId));
}

export interface RunProgress {
  fetched?: number;
  newJobs?: number;
  filtered?: number;
  scored?: number;
  matched?: number;
  errors?: RunError[];
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  configSnapshot?: unknown;
}

export async function updateRun(db: Database, runId: string, progress: RunProgress) {
  await db.update(runs).set(progress).where(eq(runs.id, runId));
}

export async function finishRun(db: Database, runId: string, status: "succeeded" | "failed", progress: RunProgress) {
  await db
    .update(runs)
    .set({ ...progress, status, finishedAt: new Date() })
    .where(eq(runs.id, runId));
}

/** Mark running runs whose heartbeat stopped (worker crashed) as failed. */
export async function reapStaleRuns(db: Database, staleMinutes: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000);
  return db
    .update(runs)
    .set({
      status: "failed",
      finishedAt: now,
      errors: sql`${runs.errors} || ${JSON.stringify([
        { stage: "worker", message: "Worker stopped responding (no heartbeat)", at: now.toISOString() },
      ])}::jsonb`,
    })
    .where(and(eq(runs.status, "running"), lt(runs.heartbeatAt, cutoff)))
    .returning({ id: runs.id });
}

export async function lastSucceededRun(db: Database, agentId: string) {
  const [row] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.status, "succeeded")))
    .orderBy(desc(runs.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listRuns(db: Database, opts: { agentId?: string; limit?: number; offset?: number } = {}) {
  return db
    .select({ run: runs, agentName: agents.name })
    .from(runs)
    .innerJoin(agents, eq(agents.id, runs.agentId))
    .where(opts.agentId ? eq(runs.agentId, opts.agentId) : undefined)
    .orderBy(desc(runs.queuedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

/** Mark a specific queued run as running (used by the CLI, which runs its own runs directly). */
export async function startRun(db: Database, runId: string, now = new Date()) {
  const [row] = await db
    .update(runs)
    .set({ status: "running", startedAt: now, heartbeatAt: now })
    .where(and(eq(runs.id, runId), eq(runs.status, "queued")))
    .returning();
  return row ?? null;
}
