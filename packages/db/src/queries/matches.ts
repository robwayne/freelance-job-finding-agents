import { computePriority, type PriorityAnchors, type PriorityWeights } from "@jf/scoring";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { agents, jobMatches, jobs, type NewJob, type NewJobMatch } from "../schema";
import { parseAgentConfig } from "./agents";

/**
 * Insert jobs, or refresh their mutable fields (proposal count, client stats) when already
 * stored. Returns the DB id for each (source, externalId).
 */
export async function upsertJobs(db: Database, rows: NewJob[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const inserted = await db
      .insert(jobs)
      .values(chunk)
      .onConflictDoUpdate({
        target: [jobs.source, jobs.externalId],
        set: {
          lastSeenAt: sql`now()`,
          proposalCount: sql`excluded.proposal_count`,
          paymentVerified: sql`coalesce(excluded.payment_verified, ${jobs.paymentVerified})`,
          clientTotalSpend: sql`coalesce(excluded.client_total_spend, ${jobs.clientTotalSpend})`,
          clientHires: sql`coalesce(excluded.client_hires, ${jobs.clientHires})`,
        },
      })
      .returning({ id: jobs.id, source: jobs.source, externalId: jobs.externalId });
    for (const r of inserted) ids.set(`${r.source}:${r.externalId}`, r.id);
  }
  return ids;
}

/** Job ids this agent has already evaluated (any outcome). */
export async function evaluatedJobIds(db: Database, agentId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await db
    .select({ jobId: jobMatches.jobId })
    .from(jobMatches)
    .where(and(eq(jobMatches.agentId, agentId), inArray(jobMatches.jobId, jobIds)));
  return new Set(rows.map((r) => r.jobId));
}

/** Insert or replace an agent's evaluation of a job. User-owned status fields are never overwritten. */
export async function upsertMatch(db: Database, row: NewJobMatch) {
  const { status: _s, statusChangedAt: _a, statusChangedBy: _b, jobId: _j, agentId: _g, createdAt: _c, ...rest } = row;
  await db
    .insert(jobMatches)
    .values(row)
    .onConflictDoUpdate({ target: [jobMatches.jobId, jobMatches.agentId], set: { ...rest, updatedAt: new Date() } });
}

export interface RescoreOptions {
  agentId?: string;
  /** Only rescore jobs posted within this many hours (used for freshness decay). */
  postedWithinHours?: number;
  anchors: PriorityAnchors;
  now?: Date;
}

/**
 * Recompute priority (no LLM) for scored matches using each agent's current weights and the
 * given anchors. Called after weights/settings change, by `pnpm rescore`, and periodically
 * by the worker so freshness stays current.
 */
export async function rescoreMatches(db: Database, opts: RescoreOptions): Promise<number> {
  const now = opts.now ?? new Date();
  const agentRows = await db
    .select()
    .from(agents)
    .where(opts.agentId ? eq(agents.id, opts.agentId) : undefined);
  let updated = 0;
  for (const agentRow of agentRows) {
    const weights: PriorityWeights = parseAgentConfig(agentRow).weights;
    const conds = [
      eq(jobMatches.agentId, agentRow.id),
      inArray(jobMatches.outcome, ["matched", "below_threshold"]),
    ];
    if (opts.postedWithinHours != null) {
      conds.push(gte(jobs.postedAt, new Date(now.getTime() - opts.postedWithinHours * 3_600_000)));
    }
    const rows = await db
      .select({ job: jobs, match: jobMatches })
      .from(jobMatches)
      .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
      .where(and(...conds));
    await db.transaction(async (tx) => {
      for (const { job, match } of rows) {
        const result = computePriority(
          {
            budgetType: job.budgetType,
            budgetMin: job.budgetMin,
            budgetMax: job.budgetMax,
            estHoursLow: match.estHoursLow,
            estHoursHigh: match.estHoursHigh,
            complexity: match.complexity,
            estDurationDays: match.estDurationDays,
            fitScore: match.fitScore,
            proposalCount: job.proposalCount,
            postedAt: job.postedAt,
          },
          weights,
          opts.anchors,
          now,
        );
        // Threshold may have changed too.
        const outcome = (match.fitScore ?? 0) >= agentRow.scoreThreshold ? "matched" : "below_threshold";
        await tx
          .update(jobMatches)
          .set({
            priority: result.priority,
            priorityComponents: result.components,
            effectiveRate: result.effectiveRate,
            totalPay: result.totalPay,
            priorityComputedAt: now,
            outcome,
          })
          .where(and(eq(jobMatches.jobId, match.jobId), eq(jobMatches.agentId, match.agentId)));
        updated++;
      }
    });
  }
  return updated;
}

/** Look up DB ids for jobs by (source, externalId) without writing. */
export async function existingJobIds(
  db: Database,
  keys: { source: string; externalId: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    if (chunk.length === 0) continue;
    const rows = await db
      .select({ id: jobs.id, source: jobs.source, externalId: jobs.externalId })
      .from(jobs)
      .where(or(...chunk.map((k) => and(eq(jobs.source, k.source), eq(jobs.externalId, k.externalId)))));
    for (const r of rows) out.set(`${r.source}:${r.externalId}`, r.id);
  }
  return out;
}
