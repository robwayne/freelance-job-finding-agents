import { loadRootEnv } from "@jf/db/env";
import { z } from "zod";

loadRootEnv();

const EnvSchema = z.object({
  DATABASE_URL_SESSION: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  UPWORK_CLIENT_ID: z.string().optional(),
  UPWORK_CLIENT_SECRET: z.string().optional(),
  UPWORK_REDIRECT_URI: z.string().optional(),
  /** Bootstrap refresh token from `pnpm --filter @jf/worker upwork:auth`; rotated tokens are stored in the DB. */
  UPWORK_REFRESH_TOKEN: z.string().optional(),
  /** "authorization_code" (default, uses refresh tokens) or "client_credentials". */
  UPWORK_GRANT_TYPE: z.enum(["authorization_code", "client_credentials"]).default("authorization_code"),
  UPWORK_TENANT_ID: z.string().optional(),
  FIXTURES_DIR: z.string().optional(),
  /** Apply pending migrations and seed defaults when the long-running worker starts. */
  AUTO_MIGRATE: z.preprocess((v) => !(v === "0" || v === "false"), z.boolean()).default(true),
  WORKER_TICK_SECONDS: z.coerce.number().min(1).default(15),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_PRETTY: z.preprocess((v) => v === "1" || v === "true", z.boolean()).default(false),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

export function requireDbUrl(): string {
  if (!env.DATABASE_URL_SESSION) throw new Error("DATABASE_URL_SESSION is not set. See .env.example.");
  return env.DATABASE_URL_SESSION;
}
