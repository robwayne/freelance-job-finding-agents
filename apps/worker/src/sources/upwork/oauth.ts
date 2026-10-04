import { getIntegrationToken, saveIntegrationToken, type Database } from "@jf/db";
import { env } from "../../lib/env";
import { HttpError, withRetry } from "../../lib/retry";

export const UPWORK_TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token";
export const UPWORK_AUTHORIZE_URL = "https://www.upwork.com/ab/account-security/oauth2/authorize";
const PROVIDER = "upwork";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export function hasUpworkCredentials(): boolean {
  return Boolean(env.UPWORK_CLIENT_ID && env.UPWORK_CLIENT_SECRET);
}

export async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  return withRetry(async () => {
    const res = await fetch(UPWORK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: env.UPWORK_CLIENT_ID ?? "",
        client_secret: env.UPWORK_CLIENT_SECRET ?? "",
        ...params,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `Upwork token request failed (${res.status})`, text.slice(0, 300));
    return JSON.parse(text) as TokenResponse;
  });
}

/**
 * Returns a valid access token. Uses the client credentials grant when configured; otherwise
 * refreshes with the stored refresh token (falling back to UPWORK_REFRESH_TOKEN), and stores
 * the rotated refresh token in the database.
 */
export async function getUpworkAccessToken(db: Database | null, now = new Date()): Promise<string> {
  if (!hasUpworkCredentials()) throw new Error("UPWORK_CLIENT_ID / UPWORK_CLIENT_SECRET not set");
  const stored = db ? await getIntegrationToken(db, PROVIDER) : null;
  if (stored?.accessToken && stored.expiresAt && stored.expiresAt.getTime() - now.getTime() > 60_000) {
    return stored.accessToken;
  }

  let token: TokenResponse;
  if (env.UPWORK_GRANT_TYPE === "client_credentials") {
    token = await requestToken({ grant_type: "client_credentials" });
  } else {
    const refreshToken = stored?.refreshToken ?? env.UPWORK_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new Error("No Upwork refresh token. Run `pnpm --filter @jf/worker upwork:auth` to authorize.");
    }
    token = await requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  if (db) {
    await saveIntegrationToken(db, PROVIDER, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? stored?.refreshToken ?? env.UPWORK_REFRESH_TOKEN ?? null,
      expiresAt: token.expires_in ? new Date(now.getTime() + token.expires_in * 1000) : null,
    });
  }
  return token.access_token;
}

export async function storeUpworkTokens(db: Database, token: TokenResponse, now = new Date()) {
  await saveIntegrationToken(db, PROVIDER, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? new Date(now.getTime() + token.expires_in * 1000) : null,
  });
}
