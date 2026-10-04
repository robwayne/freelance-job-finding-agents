import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/allowlist";
import { supabaseServer } from "@/lib/supabase";

/**
 * Magic link landing. Supports both the default PKCE link (?code=) and the token hash link
 * (?token_hash=&type=), which also works when the link is opened on another device.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const supabase = await supabaseServer();
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = (params.get("type") ?? "email") as EmailOtpType;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) return NextResponse.redirect(new URL("/login?error=link", request.url));

  const { data } = await supabase.auth.getClaims();
  if (!isAllowed(data?.claims?.email as string | undefined)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }
  return NextResponse.redirect(new URL("/jobs", request.url));
}
