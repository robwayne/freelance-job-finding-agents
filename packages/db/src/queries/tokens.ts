import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { integrationTokens } from "../schema";

export async function getIntegrationToken(db: Database, provider: string) {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, provider));
  return row ?? null;
}

export async function saveIntegrationToken(
  db: Database,
  provider: string,
  token: { accessToken: string | null; refreshToken: string | null; expiresAt: Date | null },
) {
  await db
    .insert(integrationTokens)
    .values({ provider, ...token })
    .onConflictDoUpdate({ target: integrationTokens.provider, set: { ...token, updatedAt: new Date() } });
}
