import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { UPWORK_AUTHORIZE_URL, UPWORK_STATE_COOKIE, upworkConfigured, upworkRedirectUri } from "@/lib/upwork";

/** Starts the Upwork OAuth2 authorization (read-only scopes are chosen on the API key itself). */
export async function GET() {
  await requireUser();
  if (!upworkConfigured()) return new NextResponse("Set UPWORK_CLIENT_ID and UPWORK_CLIENT_SECRET in Vercel first.", { status: 400 });
  const state = randomBytes(24).toString("hex");
  const url = new URL(UPWORK_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.UPWORK_CLIENT_ID!);
  url.searchParams.set("redirect_uri", await upworkRedirectUri());
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set(UPWORK_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/upwork", maxAge: 600 });
  return res;
}
