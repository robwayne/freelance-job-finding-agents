import { createDb } from "@jf/db";
import { env, requireDbUrl } from "./lib/env";
import { logger } from "./lib/logger";
import { Worker } from "./worker";

if (!env.ANTHROPIC_API_KEY) logger.warn("ANTHROPIC_API_KEY is not set: runs will fail at the scoring stage");

const { db, close } = createDb(requireDbUrl(), { mode: "session" });
const worker = new Worker(db, { logger });

let signals = 0;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    signals++;
    logger.info({ sig }, signals > 1 ? "forced exit" : "stopping after the current run (send again to force)");
    worker.stop();
    if (signals > 1) process.exit(1);
  });
}

await worker.loop(env.WORKER_TICK_SECONDS);
await close();
