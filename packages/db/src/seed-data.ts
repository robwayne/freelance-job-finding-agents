import { DEFAULT_WEIGHTS } from "@jf/scoring";
import type { Database } from "./client";
import { AgentFiltersSchema, DEFAULT_GLOBAL_SETTINGS, DEFAULT_OFFERS } from "./config";
import { agents, appSettings } from "./schema";

export const DEFAULT_AGENT_NAME = "Default agent";

/** Idempotent: creates the settings row and the default agent if missing. Never overwrites edits. */
export async function seedDefaults(db: Database) {
  await db
    .insert(appSettings)
    .values({ id: 1, data: DEFAULT_GLOBAL_SETTINGS, updatedBy: "seed" })
    .onConflictDoNothing();
  const [agent] = await db
    .insert(agents)
    .values({
      name: DEFAULT_AGENT_NAME,
      enabled: true,
      scheduleIntervalMinutes: 30,
      sources: ["upwork", "hn"],
      filters: AgentFiltersSchema.parse({}),
      offers: DEFAULT_OFFERS,
      weights: DEFAULT_WEIGHTS,
      scoreThreshold: 6,
    })
    .onConflictDoNothing({ target: agents.name })
    .returning();
  return { createdAgent: agent ?? null };
}
