import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client";
import { agents, jobMatches, jobs, MATCH_STATUSES, matchStatusEvents, type MatchStatus } from "../schema";

export const JOB_SORTS = [
  "priority",
  "fit",
  "rate",
  "budget",
  "hours",
  "posted",
  "proposals",
  "spend",
] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export const JOB_SORT_LABELS: Record<JobSort, string> = {
  priority: "Priority",
  fit: "Fit score",
  rate: "Effective rate",
  budget: "Total budget",
  hours: "Est. hours",
  posted: "Posted",
  proposals: "Proposals",
  spend: "Client spend",
};

/** Natural direction for each sort: "best first". */
const DEFAULT_DIR: Record<JobSort, "asc" | "desc"> = {
  priority: "desc",
  fit: "desc",
  rate: "desc",
  budget: "desc",
  hours: "asc",
  posted: "desc",
  proposals: "asc",
  spend: "desc",
};

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().finite().optional(),
);
const optionalBool = z.preprocess(
  (v) => (v === "1" || v === "true" || v === true ? true : v === "0" || v === "false" || v === false ? false : undefined),
  z.boolean().optional(),
);
const optionalString = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().optional());

/**
 * Filter and sort state for the jobs table. Parsed from URL search params, so every field
 * tolerates junk input by falling back to undefined/default.
 */
export const JobsQuerySchema = z.object({
  agent: optionalString.pipe(z.string().uuid().optional()).catch(undefined),
  offer: optionalString.catch(undefined),
  source: optionalString.catch(undefined),
  /** "active" (default) hides dismissed; "all" shows everything; or a single status. */
  status: z.enum(["active", "all", ...MATCH_STATUSES]).catch("active"),
  /** "matched" (default) or "scored" to include jobs below the agent's threshold. */
  outcome: z.enum(["matched", "scored"]).catch("matched"),
  minBudget: optionalNumber.catch(undefined),
  maxBudget: optionalNumber.catch(undefined),
  maxHours: optionalNumber.catch(undefined),
  maxComplexity: optionalNumber.catch(undefined),
  postedWithin: optionalNumber.catch(undefined),
  maxProposals: optionalNumber.catch(undefined),
  paymentVerified: optionalBool.catch(undefined),
  hideRedFlags: optionalBool.catch(undefined),
  sort: z.enum(JOB_SORTS).catch("priority"),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(200).catch(50),
});
export type JobsQuery = z.infer<typeof JobsQuerySchema>;

export function parseJobsQuery(params: Record<string, string | string[] | undefined>): JobsQuery {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) ? v[0] : v;
  return JobsQuerySchema.parse(flat);
}

const hoursMid = sql<number | null>`(coalesce(${jobMatches.estHoursLow}, ${jobMatches.estHoursHigh}) + coalesce(${jobMatches.estHoursHigh}, ${jobMatches.estHoursLow})) / 2`;

function sortExpression(sort: JobSort): SQL | SQL.Aliased | typeof jobMatches.priority {
  switch (sort) {
    case "priority":
      return sql`${jobMatches.priority}`;
    case "fit":
      return sql`${jobMatches.fitScore}`;
    case "rate":
      return sql`${jobMatches.effectiveRate}`;
    case "budget":
      return sql`${jobMatches.totalPay}`;
    case "hours":
      return hoursMid;
    case "posted":
      return sql`${jobs.postedAt}`;
    case "proposals":
      return sql`${jobs.proposalCount}`;
    case "spend":
      return sql`${jobs.clientTotalSpend}`;
  }
}

export function buildJobsWhere(q: JobsQuery, now = new Date()): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  conds.push(
    q.outcome === "matched"
      ? eq(jobMatches.outcome, "matched")
      : inArray(jobMatches.outcome, ["matched", "below_threshold"]),
  );
  if (q.agent) conds.push(eq(jobMatches.agentId, q.agent));
  if (q.offer) conds.push(eq(jobMatches.matchedOffer, q.offer));
  if (q.source) conds.push(eq(jobs.source, q.source));
  if (q.status === "active") conds.push(ne(jobMatches.status, "dismissed"));
  else if (q.status !== "all") conds.push(eq(jobMatches.status, q.status));
  if (q.minBudget != null) conds.push(gte(jobMatches.totalPay, q.minBudget));
  if (q.maxBudget != null) conds.push(lte(jobMatches.totalPay, q.maxBudget));
  if (q.maxHours != null) conds.push(sql`${hoursMid} <= ${q.maxHours}`);
  if (q.maxComplexity != null) conds.push(lte(jobMatches.complexity, q.maxComplexity));
  if (q.postedWithin != null)
    conds.push(gte(jobs.postedAt, new Date(now.getTime() - q.postedWithin * 3_600_000)));
  if (q.maxProposals != null) conds.push(lte(jobs.proposalCount, q.maxProposals));
  if (q.paymentVerified === true) conds.push(eq(jobs.paymentVerified, true));
  if (q.paymentVerified === false) conds.push(sql`${jobs.paymentVerified} is not true`);
  if (q.hideRedFlags) conds.push(sql`cardinality(${jobMatches.redFlags}) = 0`);
  return and(...conds);
}

export async function listJobs(db: Database, q: JobsQuery, now = new Date()) {
  const where = buildJobsWhere(q, now);
  const dir = q.dir ?? DEFAULT_DIR[q.sort];
  const expr = sortExpression(q.sort);
  const order = dir === "asc" ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`;

  const rows = await db
    .select({
      jobId: jobs.id,
      agentId: jobMatches.agentId,
      agentName: agents.name,
      title: jobs.title,
      url: jobs.url,
      source: jobs.source,
      budgetType: jobs.budgetType,
      budgetMin: jobs.budgetMin,
      budgetMax: jobs.budgetMax,
      proposalCount: jobs.proposalCount,
      postedAt: jobs.postedAt,
      paymentVerified: jobs.paymentVerified,
      clientTotalSpend: jobs.clientTotalSpend,
      matchedOffer: jobMatches.matchedOffer,
      outcome: jobMatches.outcome,
      fitScore: jobMatches.fitScore,
      priority: jobMatches.priority,
      effectiveRate: jobMatches.effectiveRate,
      totalPay: jobMatches.totalPay,
      estHoursLow: jobMatches.estHoursLow,
      estHoursHigh: jobMatches.estHoursHigh,
      complexity: jobMatches.complexity,
      redFlags: jobMatches.redFlags,
      status: jobMatches.status,
      matchedAt: jobMatches.createdAt,
    })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .innerJoin(agents, eq(agents.id, jobMatches.agentId))
    .where(where)
    .orderBy(order, desc(jobMatches.priority), asc(jobs.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .where(where);

  return { rows, total: countRow?.count ?? 0 };
}
export type JobListRow = Awaited<ReturnType<typeof listJobs>>["rows"][number];

export async function getJobDetail(db: Database, jobId: string, agentId: string) {
  const [row] = await db
    .select({ job: jobs, match: jobMatches, agentName: agents.name })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .innerJoin(agents, eq(agents.id, jobMatches.agentId))
    .where(and(eq(jobMatches.jobId, jobId), eq(jobMatches.agentId, agentId)));
  if (!row) return null;
  const history = await db
    .select()
    .from(matchStatusEvents)
    .where(and(eq(matchStatusEvents.jobId, jobId), eq(matchStatusEvents.agentId, agentId)))
    .orderBy(desc(matchStatusEvents.changedAt));
  return { ...row, history };
}

export async function setMatchStatus(
  db: Database,
  input: { jobId: string; agentId: string; status: MatchStatus; changedBy: string },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: jobMatches.status })
      .from(jobMatches)
      .where(and(eq(jobMatches.jobId, input.jobId), eq(jobMatches.agentId, input.agentId)))
      .for("update");
    if (!current) throw new Error("Match not found");
    if (current.status === input.status) return;
    const now = new Date();
    await tx
      .update(jobMatches)
      .set({ status: input.status, statusChangedBy: input.changedBy, statusChangedAt: now })
      .where(and(eq(jobMatches.jobId, input.jobId), eq(jobMatches.agentId, input.agentId)));
    await tx.insert(matchStatusEvents).values({
      jobId: input.jobId,
      agentId: input.agentId,
      fromStatus: current.status,
      toStatus: input.status,
      changedBy: input.changedBy,
      changedAt: now,
    });
  });
}

/** Distinct values for filter dropdowns. */
export async function getJobFacets(db: Database) {
  const sources = await db.selectDistinct({ source: jobs.source }).from(jobs).orderBy(jobs.source);
  const offers = await db
    .selectDistinct({ offer: jobMatches.matchedOffer })
    .from(jobMatches)
    .where(sql`${jobMatches.matchedOffer} is not null`)
    .orderBy(jobMatches.matchedOffer);
  const agentRows = await db.select({ id: agents.id, name: agents.name }).from(agents).orderBy(agents.name);
  return {
    sources: sources.map((s) => s.source),
    offers: offers.map((o) => o.offer!).filter(Boolean),
    agents: agentRows,
  };
}
