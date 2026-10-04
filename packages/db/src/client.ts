import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  /**
   * "transaction": Supabase transaction pooler (port 6543). Prepared statements are
   * not supported there, so they are disabled. Used by the web app.
   * "session": Supabase session pooler (port 5432). Used by the worker and migrations.
   */
  mode: "transaction" | "session";
  max?: number;
}

export function createDb(url: string, opts: CreateDbOptions): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, {
    prepare: opts.mode === "session",
    // Small pools: on serverless (Vercel) each instance holds its own; the pooler multiplexes.
    max: opts.max ?? (opts.mode === "transaction" ? 3 : 4),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}
