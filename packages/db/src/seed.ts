import { createDb } from "./client";
import { loadRootEnv, requireEnv } from "./env";
import { seedDefaults } from "./seed-data";

loadRootEnv();
const { db, close } = createDb(requireEnv("DATABASE_URL_SESSION"), { mode: "session", max: 1 });
try {
  const { createdAgent } = await seedDefaults(db);
  console.log(createdAgent ? `Seeded agent "${createdAgent.name}" (${createdAgent.id}).` : "Default agent already exists; left as is.");
} finally {
  await close();
}
