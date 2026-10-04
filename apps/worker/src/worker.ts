import {
  claimNextRun,
  getSettings,
  reapStaleRuns,
  rescoreMatches,
  scheduleDueRuns,
  type Database,
} from "@jf/db";
import type { Logger } from "./lib/logger";
import { executeRun, type RunnerDeps } from "./runner";

/**
 * One scheduler tick: reap dead runs, queue runs for agents whose interval elapsed, then
 * execute every queued run (scheduled or created from the UI), and keep freshness current.
 */
export class Worker {
  private lastFreshnessRescore = 0;
  private stopping = false;

  constructor(
    private db: Database,
    private deps: RunnerDeps & { logger: Logger },
  ) {}

  stop() {
    this.stopping = true;
  }

  async tick(now = new Date()): Promise<number> {
    const log = this.deps.logger;
    const settings = await getSettings(this.db);

    const reaped = await reapStaleRuns(this.db, settings.runs.staleRunMinutes, now);
    if (reaped.length) log.warn({ runs: reaped.map((r) => r.id) }, "marked stale runs as failed");

    const queued = await scheduleDueRuns(this.db, now);
    if (queued.length) log.info({ runs: queued.map((r) => r.id) }, "scheduled runs");

    let executed = 0;
    while (!this.stopping) {
      const run = await claimNextRun(this.db);
      if (!run) break;
      await executeRun(this.db, run, this.deps);
      executed++;
    }

    const every = settings.runs.freshnessRescoreMinutes * 60_000;
    if (every > 0 && Date.now() - this.lastFreshnessRescore >= every) {
      this.lastFreshnessRescore = Date.now();
      const n = await rescoreMatches(this.db, { anchors: settings.priority, postedWithinHours: 72 });
      if (n) log.debug({ matches: n }, "refreshed priority for recent matches");
    }
    return executed;
  }

  async loop(tickSeconds: number) {
    const log = this.deps.logger;
    log.info({ tickSeconds }, "worker started");
    while (!this.stopping) {
      try {
        await this.tick();
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : String(err) }, "tick failed");
      }
      for (let waited = 0; waited < tickSeconds * 1000 && !this.stopping; waited += 250) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    log.info("worker stopped");
  }
}
