/**
 * pnpm worker:once [--dry-run] [--mock-llm] [--agent <id>]
 *
 * Runs every enabled agent once. With --dry-run nothing is written to the database (the DB is
 * only read for agents/settings and dedupe, if DATABASE_URL_SESSION is set) and results are
 * printed. --mock-llm swaps the LLM for an offline keyword scorer.
 */
import {
  createDb,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_OFFERS,
  AgentFiltersSchema,
  enqueueRun,
  getEnabledAgents,
  getSettings,
  parseAgentConfig,
  startRun,
  type AgentConfig,
  type Database,
  type GlobalSettings,
} from "@jf/db";
import { DEFAULT_WEIGHTS } from "@jf/scoring";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { MockScorer } from "../llm/mock";
import { runPipeline, type PipelineResult } from "../pipeline/run";
import { memoryStore } from "../pipeline/store";
import { defaultScorer, executeRun } from "../runner";
import { buildSources } from "../sources/registry";
import { parseFlags } from "./args";

const flags = parseFlags(process.argv.slice(2));
const dryRun = flags.has("dry-run");
const mockLlm = flags.has("mock-llm");
const onlyAgent = typeof flags.get("agent") === "string" ? (flags.get("agent") as string) : null;

const conn = env.DATABASE_URL_SESSION ? createDb(env.DATABASE_URL_SESSION, { mode: "session" }) : null;
const db: Database | null = conn?.db ?? null;
if (!db && !dryRun) {
  console.error("DATABASE_URL_SESSION is not set. Use --dry-run to run without a database.");
  process.exit(1);
}

const scorer = mockLlm ? new MockScorer() : defaultScorer();

async function loadAgents(): Promise<AgentConfig[]> {
  if (!db) {
    logger.warn("no database configured: using the default agent and default settings");
    return [
      {
        id: "00000000-0000-0000-0000-000000000000",
        name: "Default agent (built-in)",
        enabled: true,
        scheduleIntervalMinutes: 30,
        sources: ["upwork", "hn"],
        filters: AgentFiltersSchema.parse({}),
        offers: DEFAULT_OFFERS,
        weights: DEFAULT_WEIGHTS,
        scoreThreshold: 6,
        updatedAt: new Date(),
      },
    ];
  }
  const rows = (await getEnabledAgents(db)).filter((a) => !onlyAgent || a.id === onlyAgent);
  return rows.map(parseAgentConfig);
}

const money = (n: number | null) => (n == null ? "?" : `$${Math.round(n).toLocaleString("en-US")}`);

function printResult(agent: AgentConfig, r: PipelineResult) {
  console.log(`\n=== ${agent.name} ===`);
  console.log(
    `fetched ${r.fetched} | new ${r.newJobs} | passed filter ${r.filtered} | scored ${r.scored} | matched ${r.matched}` +
      (r.deferred ? ` | deferred ${r.deferred}` : "") +
      ` | tokens ${r.inputTokens}/${r.outputTokens} | cost $${r.costUsd.toFixed(4)}`,
  );
  if (r.errors.length) {
    console.log("errors:");
    for (const e of r.errors) console.log(`  [${e.stage}${e.source ? `/${e.source}` : ""}] ${e.message}`);
  }
  if (r.results.length) {
    console.table(
      r.results.map((s) => ({
        pri: s.priority.priority.toFixed(1),
        match: s.matched ? "yes" : "",
        fit: s.output.fit_score,
        offer: s.output.matched_offer,
        rate: s.priority.effectiveRate == null ? "?" : `${money(s.priority.effectiveRate)}/h`,
        total: money(s.priority.totalPay),
        hours: `${s.output.est_hours_low}-${s.output.est_hours_high}`,
        src: s.job.source,
        title: s.job.title.slice(0, 60),
      })),
    );
  }
  if (r.rejected.length) {
    console.log(`rejected by hard filter (${r.rejected.length}):`);
    for (const { job, reasons } of r.rejected.slice(0, 15)) console.log(`  - ${job.title.slice(0, 60)}: ${reasons.join("; ")}`);
    if (r.rejected.length > 15) console.log(`  ... and ${r.rejected.length - 15} more`);
  }
}

try {
  const settings: GlobalSettings = db ? await getSettings(db) : DEFAULT_GLOBAL_SETTINGS;
  const agents = await loadAgents();
  if (agents.length === 0) console.log("No enabled agents. Run `pnpm db:seed` or enable one in the web app.");

  for (const agent of agents) {
    if (dryRun) {
      const store = memoryStore(db);
      const result = await runPipeline(agent, settings, {
        store,
        sources: buildSources(settings, db),
        scorer,
        logger,
      });
      printResult(agent, result);
      continue;
    }
    const queued = await enqueueRun(db!, agent.id, "cli");
    if (!queued) {
      console.log(`${agent.name}: a run is already queued or running; skipping.`);
      continue;
    }
    const run = await startRun(db!, queued.id);
    if (!run) {
      console.log(`${agent.name}: run was picked up by a running worker; skipping.`);
      continue;
    }
    const status = await executeRun(db!, run, { logger, scorer });
    console.log(`${agent.name}: run ${run.id} ${status}`);
  }
} finally {
  await conn?.close();
}
