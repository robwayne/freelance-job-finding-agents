import "server-only";
import { createDb, type Database } from "@jf/db";
import { env } from "./env";

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { __jfDb?: Database };

/** Transaction pooler connection (prepared statements disabled). Server only. */
export function db(): Database {
  globalForDb.__jfDb ??= createDb(env().DATABASE_URL_TRANSACTION, { mode: "transaction" }).db;
  return globalForDb.__jfDb;
}
