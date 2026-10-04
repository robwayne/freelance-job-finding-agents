import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

/**
 * Supabase client for auth only, used on the server. The URL and anon key never reach the
 * browser, and no table is readable with the anon key anyway (RLS, no policies).
 */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes sessions.
        }
      },
    },
  });
}
