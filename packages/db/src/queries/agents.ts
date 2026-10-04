import { PriorityWeightsSchema, type PriorityWeights } from "@jf/scoring";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client";
import { AgentFiltersSchema, OffersSchema, SourceIdSchema, type AgentFilters, type Offer, type SourceId } from "../config";
import { agents, jobMatches, runs, type Agent } from "../schema";

export interface AgentConfig {
  id: string;
  name: string;
  enabled: boolean;
  scheduleIntervalMinutes: number;
  sources: SourceId[];
  filters: AgentFilters;
  offers: Offer[];
  weights: PriorityWeights;
  scoreThreshold: number;
  updatedAt: Date;
}

/** Validate the JSON columns of an agent row, filling defaults for anything missing. */
export function parseAgentConfig(agent: Agent): AgentConfig {
  return {
    id: agent.id,
    name: agent.name,
    enabled: agent.enabled,
    scheduleIntervalMinutes: agent.scheduleIntervalMinutes,
    sources: agent.sources.filter((s): s is SourceId => SourceIdSchema.safeParse(s).success),
    filters: AgentFiltersSchema.parse(agent.filters ?? {}),
    offers: OffersSchema.parse(agent.offers),
    weights: PriorityWeightsSchema.parse(agent.weights ?? {}),
    scoreThreshold: agent.scoreThreshold,
    updatedAt: agent.updatedAt,
  };
}

export const AgentUpdateSchema = z.object({
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  scheduleIntervalMinutes: z.number().int().min(5).max(24 * 60),
  sources: z.array(SourceIdSchema).min(1),
  filters: AgentFiltersSchema,
  offers: OffersSchema,
  weights: PriorityWeightsSchema,
  scoreThreshold: z.number().min(0).max(10),
});
export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;

export async function listAgents(db: Database) {
  return db.select().from(agents).orderBy(agents.createdAt);
}

export async function getAgent(db: Database, id: string) {
  const [row] = await db.select().from(agents).where(eq(agents.id, id));
  return row ?? null;
}

export async function getEnabledAgents(db: Database) {
  return db.select().from(agents).where(eq(agents.enabled, true)).orderBy(agents.createdAt);
}

export async function updateAgent(db: Database, id: string, input: AgentUpdate) {
  const data = AgentUpdateSchema.parse(input);
  const [row] = await db
    .update(agents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();
  return row ?? null;
}

export async function setAgentEnabled(db: Database, id: string, enabled: boolean) {
  await db.update(agents).set({ enabled, updatedAt: new Date() }).where(eq(agents.id, id));
}

export interface AgentSummary {
  agent: Agent;
  lastRun: typeof runs.$inferSelect | null;
  activeRun: typeof runs.$inferSelect | null;
  nextRunAt: Date | null;
  matchCount: number;
  newMatchCount: number;
}

export async function listAgentSummaries(db: Database, now = new Date()): Promise<AgentSummary[]> {
  const rows = await listAgents(db);
  const counts = await db
    .select({
      agentId: jobMatches.agentId,
      matched: sql<number>`count(*)::int`,
      fresh: sql<number>`count(*) filter (where ${jobMatches.status} = 'new')::int`,
    })
    .from(jobMatches)
    .where(eq(jobMatches.outcome, "matched"))
    .groupBy(jobMatches.agentId);
  const countMap = new Map(counts.map((c) => [c.agentId, c]));

  return Promise.all(
    rows.map(async (agent) => {
      const [lastRun] = await db
        .select()
        .from(runs)
        .where(and(eq(runs.agentId, agent.id), sql`${runs.status} in ('succeeded', 'failed')`))
        .orderBy(desc(runs.queuedAt))
        .limit(1);
      const [activeRun] = await db
        .select()
        .from(runs)
        .where(and(eq(runs.agentId, agent.id), sql`${runs.status} in ('queued', 'running')`))
        .limit(1);
      const lastStart = lastRun?.queuedAt ?? null;
      const nextRunAt = !agent.enabled
        ? null
        : lastStart
          ? new Date(Math.max(now.getTime(), lastStart.getTime() + agent.scheduleIntervalMinutes * 60_000))
          : now;
      const c = countMap.get(agent.id);
      return {
        agent,
        lastRun: lastRun ?? null,
        activeRun: activeRun ?? null,
        nextRunAt,
        matchCount: c?.matched ?? 0,
        newMatchCount: c?.fresh ?? 0,
      };
    }),
  );
}
