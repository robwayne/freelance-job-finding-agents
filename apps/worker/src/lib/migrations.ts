import { seedDefaults, type Database } from "@jf/db";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Logger } from "./logger";

/** MIGRATIONS_DIR (set in the Docker image), else packages/db/migrations found from the cwd. */
export function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "packages/db/migrations");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("Could not find packages/db/migrations; set MIGRATIONS_DIR");
}

/**
 * Apply pending migrations and create default rows if missing, so schema changes ship with a
 * worker deploy. Already-applied migrations (including ones run via supabase/setup.sql) are skipped.
 */
export async function migrateAndSeed(db: Database, logger: Logger) {
  await migrate(db, { migrationsFolder: migrationsDir() });
  const { createdAgent } = await seedDefaults(db);
  logger.info({ seededAgent: createdAgent?.name ?? null }, "database schema up to date");
}
