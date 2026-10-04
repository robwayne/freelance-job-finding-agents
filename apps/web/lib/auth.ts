import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isAllowed } from "./allowlist";
import { supabaseServer } from "./supabase";

/** The signed-in, allowlisted user's email, or a redirect to /login. Checked in every page and action. */
export const requireUser = cache(async (): Promise<string> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  if (!email || !isAllowed(email)) redirect("/login");
  return email;
});
