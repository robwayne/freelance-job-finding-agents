import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { createDb } from "./client";
import { loadRootEnv, requireEnv } from "./env";

loadRootEnv();
const { db, close } = createDb(requireEnv("DATABASE_URL_SESSION"), { mode: "session", max: 1 });
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");
} finally {
  await close();
}
