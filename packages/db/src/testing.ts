import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Database } from "./client";
import * as schema from "./schema";

/**
 * In-process Postgres with all migrations applied, for tests. The PGlite driver exposes the
 * same query builder API as postgres-js, so it's typed as the app's Database.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  return { db: db as unknown as Database, close: () => client.close() };
}
