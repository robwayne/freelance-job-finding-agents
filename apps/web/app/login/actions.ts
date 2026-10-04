"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAllowed } from "@/lib/allowlist";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: "Enter a valid email." };
  const email = parsed.data;

  // Same response either way, so the form doesn't reveal who is on the allowlist.
  const sent: LoginState = { status: "sent", message: `If ${email} is allowed, a sign-in link is on its way.` };
  if (!isAllowed(email)) return sent;

  const h = await headers();
  const origin = env().APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error) return { status: "error", message: error.message };
  return sent;
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
