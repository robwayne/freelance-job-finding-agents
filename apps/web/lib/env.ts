import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL_TRANSACTION: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ALLOWED_EMAILS: z.string().min(1),
  /** Public origin used in magic link redirects, e.g. https://jobs.example.com. Defaults to the request origin. */
  APP_URL: z.string().url().optional(),
});

let cached: z.infer<typeof EnvSchema> | null = null;

export function env() {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
