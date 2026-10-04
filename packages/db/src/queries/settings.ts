import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { GlobalSettingsSchema, parseGlobalSettings, type GlobalSettings } from "../config";
import { appSettings } from "../schema";

/** Always reads the latest saved settings. Missing row or keys fall back to defaults. */
export async function getSettings(db: Database): Promise<GlobalSettings & { updatedAt: Date | null; updatedBy: string | null }> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  return { ...parseGlobalSettings(row?.data), updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
}

export async function saveSettings(db: Database, input: unknown, updatedBy: string): Promise<GlobalSettings> {
  const data = GlobalSettingsSchema.parse(input);
  await db
    .insert(appSettings)
    .values({ id: 1, data, updatedBy })
    .onConflictDoUpdate({ target: appSettings.id, set: { data, updatedBy, updatedAt: new Date() } });
  return data;
}
