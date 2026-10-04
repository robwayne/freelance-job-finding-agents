import {
  finishRun,
  getAgent,
  getSettings,
  heartbeatRun,
  parseAgentConfig,
  updateRun,
  type Database,
  type Run,
} from "@jf/db";
import { env } from "./lib/env";
import type { Logger } from "./lib/logger";
import { AnthropicScorer, type Scorer } from "./llm/scorer";
import { runPipeline } from "./pipeline/run";
import { dbStore } from "./pipeline/store";
import { buildSources } from "./sources/registry";
import type { Source } from "./sources/types";

export interface RunnerDeps {
  logger: Logger;
  scorer?: Scorer;
  sources?: Source[];
  now?: () => Date;
  heartbeatMs?: number;
}

export function defaultScorer(): Scorer {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return new AnthropicScorer(env.ANTHROPIC_API_KEY);
}

/**
 * Execute a claimed (running) run. Settings and the agent are read fresh from the DB here,
 * so every run uses the latest saved configuration, and both are snapshotted onto the run.
 */
export async function executeRun(db: Database, run: Run, deps: RunnerDeps): Promise<"succeeded" | "failed"> {
  const log = deps.logger.child({ runId: run.id, agentId: run.agentId });
  const heartbeat = setInterval(() => {
    heartbeatRun(db, run.id).catch((err) => log.warn({ err: String(err) }, "heartbeat failed"));
  }, deps.heartbeatMs ?? 30_000);
  try {
    const settings = await getSettings(db);
    const agentRow = await getAgent(db, run.agentId);
    if (!agentRow) throw new Error("Agent no longer exists");
    const paused = !agentRow.enabled;
    if (paused && (run.trigger === "schedule" || !settings.runs.allowManualRunWhenPaused)) {
      throw new Error("Agent is paused");
    }
    const agent = parseAgentConfig(agentRow);
    const { updatedAt: settingsUpdatedAt, updatedBy: _by, ...settingsData } = settings;
    await updateRun(db, run.id, { configSnapshot: { agent, settings: settingsData, settingsUpdatedAt } });
    log.info({ agent: agent.name, trigger: run.trigger }, "run started");

    const result = await runPipeline(agent, settingsData, {
      store: dbStore(db),
      sources: deps.sources ?? buildSources(settingsData, db),
      scorer: deps.scorer ?? defaultScorer(),
      logger: deps.logger, // runPipeline adds agentId/runId itself
      now: deps.now,
      runId: run.id,
      onProgress: (p) => updateRun(db, run.id, p),
    });

    const allSourcesFailed =
      agent.sources.length > 0 && result.errors.filter((e) => e.stage === "fetch").length >= agent.sources.length;
    const status = allSourcesFailed ? "failed" : "succeeded";
    await finishRun(db, run.id, status, {
      fetched: result.fetched,
      newJobs: result.newJobs,
      filtered: result.filtered,
      scored: result.scored,
      matched: result.matched,
      errors: result.errors,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });
    log.info({ status }, "run finished");
    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "run failed");
    await finishRun(db, run.id, "failed", {
      errors: [{ stage: "run", message, at: new Date().toISOString() }],
    }).catch((e) => log.error({ err: String(e) }, "could not mark run failed"));
    return "failed";
  } finally {
    clearInterval(heartbeat);
  }
}
