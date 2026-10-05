/**
 * pnpm worker:tick
 *
 * One scheduler pass, then exit: apply pending migrations, mark dead runs failed, queue agents
 * whose interval has elapsed, execute every queued run (including "Run now" from the web app)
 * and refresh freshness. This is the same work the long-running worker does every ~15s; it
 * exists for schedulers like GitHub Actions or cron, where nothing stays running.
 */
import { createDb } from "@jf/db";
import { env, requireDbUrl } from "../lib/env";
import { logger } from "../lib/logger";
import { migrateAndSeed } from "../lib/migrations";
import { Worker } from "../worker";

if (!env.ANTHROPIC_API_KEY) logger.warn("ANTHROPIC_API_KEY is not set: runs will fail at the scoring stage");

const { db, close } = createDb(requireDbUrl(), { mode: "session" });
try {
  if (env.AUTO_MIGRATE) await migrateAndSeed(db, logger);
  const executed = await new Worker(db, { logger }).tick();
  logger.info({ executed }, "tick complete");
} finally {
  await close();
}
