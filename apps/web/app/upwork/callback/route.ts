import { saveIntegrationToken } from "@jf/db";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { UPWORK_PROVIDER, UPWORK_STATE_COOKIE, UPWORK_TOKEN_URL, upworkRedirectUri } from "@/lib/upwork";

/**
 * Upwork redirects here after you approve access. Exchanges the code for tokens and stores
 * them in integration_tokens; the worker refreshes them from there.
 */
export async function GET(request: NextRequest) {
  await requireUser();
  const params = request.nextUrl.searchParams;
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings?upwork=${result}`, request.url));
    res.cookies.delete({ name: UPWORK_STATE_COOKIE, path: "/upwork" });
    return res;
  };

  const expected = request.cookies.get(UPWORK_STATE_COOKIE)?.value;
  if (!expected || params.get("state") !== expected) return back("state_mismatch");
  if (params.get("error")) return back("denied");
  const code = params.get("code");
  if (!code) return back("missing_code");

  const tokenRes = await fetch(UPWORK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: await upworkRedirectUri(),
      client_id: process.env.UPWORK_CLIENT_ID ?? "",
      client_secret: process.env.UPWORK_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!tokenRes.ok) {
    console.error("Upwork token exchange failed", tokenRes.status, (await tokenRes.text()).slice(0, 300));
    return back("exchange_failed");
  }
  const token = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  await saveIntegrationToken(db(), UPWORK_PROVIDER, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
  });
  return back("connected");
}
