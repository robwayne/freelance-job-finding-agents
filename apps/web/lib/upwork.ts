import "server-only";
import { headers } from "next/headers";

export const UPWORK_AUTHORIZE_URL = "https://www.upwork.com/ab/account-security/oauth2/authorize";
export const UPWORK_TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token";
export const UPWORK_PROVIDER = "upwork";
export const UPWORK_STATE_COOKIE = "upwork_oauth_state";

export function upworkConfigured(): boolean {
  return Boolean(process.env.UPWORK_CLIENT_ID && process.env.UPWORK_CLIENT_SECRET);
}

/** The callback URL to register on the Upwork API key. Must match exactly. */
export async function upworkRedirectUri(): Promise<string> {
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return `${origin.replace(/\/$/, "")}/upwork/callback`;
}
