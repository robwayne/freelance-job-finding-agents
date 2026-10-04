import { DEFAULT_ANCHORS } from "@jf/scoring";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { DEFAULT_GLOBAL_SETTINGS } from "../config";
import { agents, jobMatches, jobs, matchStatusEvents, runs, type NewJob, type NewJobMatch } from "../schema";
import { seedDefaults } from "../seed-data";
import { createTestDb } from "../testing";
import { listAgentSummaries, updateAgent, parseAgentConfig } from "./agents";
import { getJobDetail, listJobs, parseJobsQuery, setMatchStatus } from "./jobs";
import { evaluatedJobIds, rescoreMatches, upsertJobs, upsertMatch } from "./matches";
import { claimNextRun, enqueueRun, reapStaleRuns, scheduleDueRuns } from "./runs";
import { getSettings, saveSettings } from "./settings";
import { touchJobsVisit } from "./user-state";

const NOW = new Date("2026-10-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let db: Database;
let close: () => Promise<void>;
let agentId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());

async function reset() {
  await db.execute(sql`truncate table match_status_events, job_matches, runs, jobs, agents, app_settings, user_state cascade`);
  await seedDefaults(db);
  const [a] = await db.select().from(agents);
  agentId = a!.id;
}

interface Fixture {
  key: string;
  job: Partial<NewJob>;
  match: Partial<NewJobMatch>;
}

const fixtures: Fixture[] = [
  {
    key: "a",
    job: { source: "upwork", budgetType: "fixed", budgetMin: 3000, budgetMax: 3000, proposalCount: 3, postedAt: hoursAgo(2), paymentVerified: true, clientTotalSpend: 50000 },
    match: { matchedOffer: "ai_support_bot", fitScore: 9, priority: 80, effectiveRate: 100, totalPay: 3000, estHoursLow: 20, estHoursHigh: 40, complexity: 2 },
  },
  {
    key: "b",
    job: { source: "upwork", budgetType: "hourly", budgetMin: 60, budgetMax: 80, proposalCount: 15, postedAt: hoursAgo(30), paymentVerified: true, clientTotalSpend: 12000 },
    match: { matchedOffer: "workflow_automation", fitScore: 7, priority: 55, effectiveRate: 70, totalPay: 2800, estHoursLow: 30, estHoursHigh: 50, complexity: 3, redFlags: ["vague scope"] },
  },
  {
    key: "c",
    job: { source: "hn", budgetType: "unknown", proposalCount: null, postedAt: hoursAgo(10), paymentVerified: null, clientTotalSpend: null },
    match: { matchedOffer: "ai_feature", fitScore: 8, priority: 60, effectiveRate: null, totalPay: null, estHoursLow: 80, estHoursHigh: 120, complexity: 4 },
  },
  {
    key: "d",
    job: { source: "upwork", budgetType: "fixed", budgetMin: 800, budgetMax: 800, proposalCount: 8, postedAt: hoursAgo(5), paymentVerified: false, clientTotalSpend: 20000 },
    match: { outcome: "below_threshold", matchedOffer: "server_side_tracking", fitScore: 4, priority: 30, effectiveRate: 80, totalPay: 800, estHoursLow: 8, estHoursHigh: 12, complexity: 1 },
  },
  {
    key: "e",
    job: { source: "upwork", budgetType: "fixed", budgetMin: 10000, budgetMax: 10000, proposalCount: 1, postedAt: hoursAgo(1), paymentVerified: true, clientTotalSpend: 200000 },
    match: { matchedOffer: "ai_support_bot", fitScore: 8, priority: 90, effectiveRate: 125, totalPay: 10000, estHoursLow: 60, estHoursHigh: 100, complexity: 3, status: "dismissed" },
  },
];

async function insertFixtures() {
  const ids: Record<string, string> = {};
  const idMap = await upsertJobs(
    db,
    fixtures.map((f) => ({
      externalId: f.key,
      url: `https://example.com/${f.key}`,
      title: `Job ${f.key}`,
      description: `Description ${f.key}`,
      source: "upwork",
      ...f.job,
    })),
  );
  for (const f of fixtures) {
    const jobId = idMap.get(`${f.job.source ?? "upwork"}:${f.key}`)!;
    ids[f.key] = jobId;
    await upsertMatch(db, { jobId, agentId, outcome: "matched", ...f.match });
  }
  return ids;
}

const keys = async (params: Record<string, string>) => {
  const { rows } = await listJobs(db, parseJobsQuery(params), NOW);
  return rows.map((r) => r.title.replace("Job ", ""));
};

describe("jobs query: filters and sorts", () => {
  beforeAll(async () => {
    await reset();
    await insertFixtures();
  });

  it("defaults to matched, non-dismissed, sorted by priority desc", async () => {
    expect(await keys({})).toEqual(["a", "c", "b"]);
  });

  it("includes below-threshold when outcome=scored, dismissed when status=all", async () => {
    expect(await keys({ outcome: "scored", status: "all" })).toEqual(["e", "a", "c", "b", "d"]);
    expect(await keys({ status: "dismissed" })).toEqual(["e"]);
  });

  it.each([
    ["fit", ["a", "c", "b"]],
    ["rate", ["a", "b", "c"]], // nulls last
    ["budget", ["a", "b", "c"]],
    ["hours", ["a", "b", "c"]], // ascending by default
    ["posted", ["a", "c", "b"]],
    ["proposals", ["a", "b", "c"]], // ascending, unknown last
    ["spend", ["a", "b", "c"]],
  ])("sorts by %s", async (sort, expected) => {
    expect(await keys({ sort })).toEqual(expected);
  });

  it("respects explicit direction and keeps nulls last", async () => {
    expect(await keys({ sort: "rate", dir: "asc" })).toEqual(["b", "a", "c"]);
  });

  it("filters by source, offer and agent", async () => {
    expect(await keys({ source: "hn" })).toEqual(["c"]);
    expect(await keys({ offer: "workflow_automation" })).toEqual(["b"]);
    expect(await keys({ agent: agentId })).toEqual(["a", "c", "b"]);
    expect(await keys({ agent: "00000000-0000-0000-0000-000000000000" })).toEqual([]);
  });

  it("combines budget, hours, complexity, proposals and recency filters", async () => {
    expect(await keys({ minBudget: "2900" })).toEqual(["a"]);
    expect(await keys({ maxBudget: "2900" })).toEqual(["b"]);
    expect(await keys({ maxHours: "40" })).toEqual(["a", "b"]);
    expect(await keys({ maxComplexity: "3" })).toEqual(["a", "b"]);
    expect(await keys({ maxProposals: "10" })).toEqual(["a"]);
    expect(await keys({ postedWithin: "24" })).toEqual(["a", "c"]);
    expect(await keys({ postedWithin: "24", maxComplexity: "3", sort: "fit" })).toEqual(["a"]);
  });

  it("filters payment verified and red flags", async () => {
    expect(await keys({ paymentVerified: "1" })).toEqual(["a", "b"]);
    expect(await keys({ hideRedFlags: "1" })).toEqual(["a", "c"]);
    expect(await keys({ paymentVerified: "1", hideRedFlags: "true" })).toEqual(["a"]);
  });

  it("ignores junk params", async () => {
    expect(await keys({ sort: "nope", minBudget: "abc", status: "weird", agent: "not-a-uuid" })).toEqual(["a", "c", "b"]);
  });

  it("paginates and counts", async () => {
    const res = await listJobs(db, parseJobsQuery({ pageSize: "10", page: "1" }), NOW);
    expect(res.total).toBe(3);
    const page2 = await listJobs(db, parseJobsQuery({ pageSize: "10", page: "2" }), NOW);
    expect(page2.rows).toEqual([]);
  });
});

describe("match status", () => {
  it("records who changed status and when, with history", async () => {
    await reset();
    const ids = await insertFixtures();
    await setMatchStatus(db, { jobId: ids.a!, agentId, status: "saved", changedBy: "a@x.com" });
    await setMatchStatus(db, { jobId: ids.a!, agentId, status: "applied", changedBy: "b@x.com" });
    const detail = await getJobDetail(db, ids.a!, agentId);
    expect(detail?.match.status).toBe("applied");
    expect(detail?.match.statusChangedBy).toBe("b@x.com");
    expect(detail?.history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      ["saved", "applied"],
      ["new", "saved"],
    ]);
    // Re-scoring the job must not clobber the user's status.
    await upsertMatch(db, { jobId: ids.a!, agentId, outcome: "matched", fitScore: 5 });
    const again = await getJobDetail(db, ids.a!, agentId);
    expect(again?.match.status).toBe("applied");
    expect(await db.select().from(matchStatusEvents)).toHaveLength(2);
  });
});

describe("runs", () => {
  beforeEach(reset);

  it("schedules due agents once and claims queued runs", async () => {
    const first = await scheduleDueRuns(db, NOW);
    expect(first).toHaveLength(1);
    expect(await scheduleDueRuns(db, NOW)).toHaveLength(0); // already queued
    expect(await enqueueRun(db, agentId, "manual", "me@x.com")).toBeNull(); // one active per agent

    const claimed = await claimNextRun(db, NOW);
    expect(claimed?.status).toBe("running");
    expect(await claimNextRun(db, NOW)).toBeNull();

    await db.update(runs).set({ status: "succeeded" }).where(eq(runs.id, claimed!.id));
    // Interval (30 min) not yet elapsed since it was queued.
    expect(await scheduleDueRuns(db, new Date(Date.now() + 10 * 60_000))).toHaveLength(0);
    expect(await scheduleDueRuns(db, new Date(Date.now() + 31 * 60_000))).toHaveLength(1);
  });

  it("does not schedule paused agents but allows manual runs", async () => {
    await db.update(agents).set({ enabled: false });
    expect(await scheduleDueRuns(db, NOW)).toHaveLength(0);
    expect(await enqueueRun(db, agentId, "manual", "me@x.com")).not.toBeNull();
  });

  it("reaps runs with a stale heartbeat", async () => {
    await enqueueRun(db, agentId, "cli");
    const run = await claimNextRun(db, hoursAgo(1));
    const reaped = await reapStaleRuns(db, 10, NOW);
    expect(reaped.map((r) => r.id)).toEqual([run!.id]);
    const [row] = await db.select().from(runs).where(eq(runs.id, run!.id));
    expect(row?.status).toBe("failed");
    expect(row?.errors[0]?.message).toMatch(/heartbeat/);
  });

  it("summarizes agents with last and next run", async () => {
    const [summary] = await listAgentSummaries(db, NOW);
    expect(summary?.lastRun).toBeNull();
    expect(summary?.nextRunAt).toEqual(NOW);
  });
});

describe("rescoring and settings", () => {
  it("rescores with new weights and re-applies the threshold", async () => {
    await reset();
    const ids = await insertFixtures();
    const [agent] = await db.select().from(agents);
    const cfg = parseAgentConfig(agent!);
    await updateAgent(db, agentId, {
      ...cfg,
      weights: { rate: 0, pay: 0, complexity: 0, duration: 0, fit: 1, competition: 0, freshness: 0 },
      scoreThreshold: 8.5,
    });
    const n = await rescoreMatches(db, { anchors: DEFAULT_ANCHORS, now: NOW });
    expect(n).toBe(5);
    const rows = await db.select().from(jobMatches);
    const a = rows.find((r) => r.jobId === ids.a)!;
    expect(a.priority).toBe(90); // fit 9/10 only
    expect(a.priorityComponents?.fit.contribution).toBe(90);
    expect(a.outcome).toBe("matched");
    expect(rows.find((r) => r.jobId === ids.b)!.outcome).toBe("below_threshold");
  });

  it("only rescores recent jobs when asked", async () => {
    await reset();
    await insertFixtures();
    expect(await rescoreMatches(db, { anchors: DEFAULT_ANCHORS, now: NOW, postedWithinHours: 6 })).toBe(3);
  });

  it("reads defaults, saves and reads back settings", async () => {
    await reset();
    const s = await getSettings(db);
    expect(s.scoring.model).toBe(DEFAULT_GLOBAL_SETTINGS.scoring.model);
    await saveSettings(db, { ...s, priority: { ...s.priority, rateTarget: 200 } }, "me@x.com");
    const after = await getSettings(db);
    expect(after.priority.rateTarget).toBe(200);
    expect(after.updatedBy).toBe("me@x.com");
    await expect(saveSettings(db, { scoring: { maxConcurrency: 0 } }, "me@x.com")).rejects.toThrow();
  });

  it("tracks evaluated jobs per agent", async () => {
    await reset();
    const ids = await insertFixtures();
    const seen = await evaluatedJobIds(db, agentId, [ids.a!, "00000000-0000-0000-0000-000000000000"]);
    expect([...seen]).toEqual([ids.a]);
    expect((await db.select().from(jobs)).length).toBe(5);
  });
});

describe("new since last visit", () => {
  it("keeps the cutoff stable within a visit and advances it on the next one", async () => {
    await reset();
    const t0 = new Date("2026-10-01T08:00:00Z");
    expect(await touchJobsVisit(db, "me@x.com", t0)).toBeNull();
    const t1 = new Date(t0.getTime() + 5 * 60_000);
    expect(await touchJobsVisit(db, "me@x.com", t1)).toBeNull(); // same visit, first ever
    const t2 = new Date(t1.getTime() + 3 * 3_600_000);
    expect(await touchJobsVisit(db, "me@x.com", t2)).toEqual(t1);
    const t3 = new Date(t2.getTime() + 60_000);
    expect(await touchJobsVisit(db, "me@x.com", t3)).toEqual(t1);
  });
});
