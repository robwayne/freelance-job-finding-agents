import {
  enqueueRun,
  getSettings,
  jobMatches,
  listJobs,
  parseJobsQuery,
  runs,
  saveSettings,
  seedDefaults,
  agents,
  type Database,
} from "@jf/db";
import { createTestDb } from "@jf/db/testing";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import pino from "pino";
import type { Scorer, ScoreRequest } from "../llm/scorer";
import { validateScore } from "../llm/scorer";
import { createHnSource } from "../sources/hn";
import { createUpworkSource } from "../sources/upwork";
import type { Source } from "../sources/types";
import { Worker } from "../worker";
import { runPipeline } from "./run";
import { memoryStore } from "./store";

const NOW = new Date("2026-10-01T12:00:00Z");
const fixturesDir = fileURLToPath(new URL("../../../../fixtures/", import.meta.url));
const logger = pino({ level: "silent" });

/** Mocked LLM: canned outputs keyed by a word in the title. */
const CANNED: Record<string, { offer: string; fit: number; hours: [number, number]; complexity: number; days: number; flags?: string[] }> = {
  chatbot: { offer: "ai_support_bot", fit: 9, hours: [40, 60], complexity: 2, days: 14 },
  conversions: { offer: "server_side_tracking", fit: 9, hours: [25, 35], complexity: 2, days: 7 },
  lead: { offer: "workflow_automation", fit: 8, hours: [20, 30], complexity: 2, days: 7 },
  summarization: { offer: "ai_feature", fit: 7, hours: [60, 100], complexity: 3, days: 21, flags: ["scope creep risk"] },
  knowledge: { offer: "ai_support_bot", fit: 8, hours: [80, 120], complexity: 4, days: 30 },
  n8n: { offer: "workflow_automation", fit: 7, hours: [30, 50], complexity: 3, days: 14 },
  meta: { offer: "server_side_tracking", fit: 8, hours: [30, 40], complexity: 2, days: 10 },
  automation: { offer: "workflow_automation", fit: 6, hours: [20, 40], complexity: 2, days: 10 },
};

class CannedScorer implements Scorer {
  calls: string[] = [];
  failTitles = new Set<string>();
  async score({ job, offers }: ScoreRequest) {
    this.calls.push(job.title);
    if ([...this.failTitles].some((t) => job.title.includes(t))) throw new Error("API overloaded");
    const key = Object.keys(CANNED).find((k) => `${job.title} ${job.description}`.toLowerCase().includes(k));
    const c = key ? CANNED[key]! : { offer: "none", fit: 1, hours: [10, 20] as [number, number], complexity: 3, days: 10 };
    const output = validateScore(
      {
        matched_offer: c.offer,
        fit_score: c.fit,
        reasoning: "Canned.",
        red_flags: c.flags ?? [],
        failure_case: "Webhook retries creating duplicates.",
        opener: "You need this done.",
        est_hours_low: c.hours[0],
        est_hours_high: c.hours[1],
        complexity: c.complexity,
        est_duration_days: c.days,
        budget_confidence: "medium",
      },
      offers,
    );
    return { output, inputTokens: 1200, outputTokens: 300, model: "mock" };
  }
}

/** Serve the HN fixtures through a stubbed fetch, so the real HN client code runs. */
function stubHnFetch() {
  const stories = readFileSync(`${fixturesDir}hn/stories-sample.json`, "utf8");
  const comments = readFileSync(`${fixturesDir}hn/comments-sample.json`, "utf8");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.includes("tags=story") ? stories : url.includes("tags=comment") ? comments : null;
      return body ? new Response(body, { status: 200 }) : new Response("not found", { status: 404 });
    }),
  );
}

const upwork = () =>
  createUpworkSource({ mode: "fixture", searchQueries: [], fixturesDir: `${fixturesDir}upwork`, db: null });
const failing: Source = {
  id: "hn",
  fetchJobs: async () => {
    throw new Error("HN is down");
  },
};

let db: Database;
let close: () => Promise<void>;
let agentId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDefaults(db);
  const [a] = await db.select().from(agents);
  agentId = a!.id;
});
afterAll(async () => close());
afterEach(() => vi.unstubAllGlobals());

describe("pipeline end to end on fixtures with a mocked LLM", () => {
  const scorer = new CannedScorer();

  it("runs a scheduled tick: fetch, filter, score, persist", async () => {
    stubHnFetch();
    const worker = new Worker(db, {
      logger,
      scorer,
      sources: [upwork(), createHnSource()],
      now: () => NOW,
    });
    expect(await worker.tick(NOW)).toBe(1);

    const [run] = await db.select().from(runs);
    // Sources drop jobs older than the agent's max age (Upwork: 1 of 12, HN: 1 of 4 posts).
    expect(run).toMatchObject({ status: "succeeded", trigger: "schedule", fetched: 14, newJobs: 14 });
    // Upwork: 7 of 11 pass the hard filter. HN: all 3 pass (unknown fields don't reject).
    expect(run!.filtered).toBe(10);
    expect(run!.scored).toBe(10);
    expect(run!.inputTokens).toBe(12_000);
    expect(run!.costUsd).toBeCloseTo((12_000 * 1 + 3_000 * 5) / 1e6, 8);
    expect(run!.errors).toEqual([]);
    expect(run!.configSnapshot).toMatchObject({ agent: { id: agentId }, settings: { scoring: { model: "claude-haiku-4-5-20251001" } } });

    const all = await db.select().from(jobMatches);
    const byOutcome = (o: string) => all.filter((m) => m.outcome === o).length;
    expect(byOutcome("rejected")).toBe(4);
    expect(byOutcome("matched")).toBe(run!.matched);
    expect(byOutcome("below_threshold")).toBe(10 - run!.matched);

    const reasons = all.flatMap((m) => m.filterReasons).join(" | ");
    expect(reasons).toMatch(/Excluded keyword: starter project/);
    expect(reasons).toMatch(/Payment not verified/);
    expect(reasons).toMatch(/35 proposals/);
    expect(reasons).toMatch(/per hire/);

    // Unknown fields are carried to the match for HN and the Upwork job without client stats.
    const hn = all.find((m) => m.unknownFields.includes("proposal_count") && m.outcome !== "rejected");
    expect(hn?.unknownFields).toEqual(expect.arrayContaining(["payment_verified", "client_total_spend"]));

    const { rows } = await listJobs(db, parseJobsQuery({}), NOW);
    expect(rows.length).toBe(run!.matched);
    // Sorted by priority, with every component stored.
    const priorities = rows.map((r) => r.priority!);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    const top = all.find((m) => m.jobId === rows[0]!.jobId)!;
    expect(Object.keys(top.priorityComponents!)).toHaveLength(7);
    expect(rows.map((r) => r.title)).toContain("AI chatbot trained on our help center and PDFs");
    expect(rows.map((r) => r.title)).not.toContain("Mobile game artwork");
  });

  it("dedupes on the next run: nothing is re-scored", async () => {
    stubHnFetch();
    const before = scorer.calls.length;
    await enqueueRun(db, agentId, "manual", "me@example.com");
    const worker = new Worker(db, { logger, scorer, sources: [upwork(), createHnSource()], now: () => NOW });
    expect(await worker.tick(NOW)).toBe(1);
    const latest = (await db.select().from(runs)).find((r) => r.trigger === "manual")!;
    expect(latest).toMatchObject({ status: "succeeded", fetched: 14, newJobs: 0, scored: 0 });
    expect(scorer.calls.length).toBe(before);
  });

  it("keeps going when one source fails and retries jobs whose scoring failed", async () => {
    const { db: db2, close: close2 } = await createTestDb();
    try {
      await seedDefaults(db2);
      const s = new CannedScorer();
      s.failTitles.add("Meta Conversions API");
      const worker = new Worker(db2, { logger, scorer: s, sources: [upwork(), failing], now: () => NOW });
      await worker.tick(NOW);
      const [run] = await db2.select().from(runs);
      expect(run!.status).toBe("succeeded");
      expect(run!.fetched).toBe(11);
      expect(run!.scored).toBe(6);
      expect(run!.errors.map((e) => `${e.stage}:${e.message}`)).toEqual(
        expect.arrayContaining(["fetch:HN is down", "score:API overloaded"]),
      );
      // The failed job has no match row, so the next run scores it.
      s.failTitles.clear();
      const [agent] = await db2.select().from(agents);
      await enqueueRun(db2, agent!.id, "manual");
      await worker.tick(NOW);
      expect(s.calls.filter((t) => t.includes("Meta Conversions API"))).toHaveLength(2);
    } finally {
      await close2();
    }
  });

  it("uses the latest saved settings and agent config on each run", async () => {
    const { db: db3, close: close3 } = await createTestDb();
    try {
      await seedDefaults(db3);
      const settings = await getSettings(db3);
      await saveSettings(db3, { ...settings, scoring: { ...settings.scoring, maxJobsPerRun: 2, inputCostPerMTok: 2 } }, "me@example.com");
      const s = new CannedScorer();
      const worker = new Worker(db3, { logger, scorer: s, sources: [upwork()], now: () => NOW });
      await worker.tick(NOW);
      const [run] = await db3.select().from(runs);
      expect(run!.scored).toBe(2);
      expect(run!.costUsd).toBeCloseTo((2400 * 2 + 600 * 5) / 1e6, 8);
      expect(run!.configSnapshot).toMatchObject({ settings: { scoring: { maxJobsPerRun: 2 } }, settingsUpdatedAt: expect.any(String) });
    } finally {
      await close3();
    }
  });

  it("fails scheduled runs for paused agents but honors manual runs", async () => {
    const { db: db4, close: close4 } = await createTestDb();
    try {
      await seedDefaults(db4);
      const [agent] = await db4.select().from(agents);
      await db4.update(agents).set({ enabled: false });
      const worker = new Worker(db4, { logger, scorer: new CannedScorer(), sources: [upwork()], now: () => NOW });
      expect(await worker.tick(NOW)).toBe(0);
      await enqueueRun(db4, agent!.id, "manual", "me@example.com");
      await worker.tick(NOW);
      const [run] = await db4.select().from(runs);
      expect(run!.status).toBe("succeeded");
    } finally {
      await close4();
    }
  });

  it("dry run writes nothing", async () => {
    const before = (await db.select().from(jobMatches)).length;
    const store = memoryStore(null);
    const settings = await getSettings(db);
    const [agentRow] = await db.select().from(agents);
    const { parseAgentConfig } = await import("@jf/db");
    const result = await runPipeline(parseAgentConfig(agentRow!), settings, {
      store,
      sources: [upwork()],
      scorer: new CannedScorer(),
      logger,
      now: () => NOW,
    });
    expect(result.scored).toBe(7);
    expect(store.matches.length).toBe(11);
    expect((await db.select().from(jobMatches)).length).toBe(before);
  });
});
