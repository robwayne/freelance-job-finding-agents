import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";
import { STUCK_QUEUE_MINUTES } from "./format";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

const REQUIRED = ["DATABASE_URL_TRANSACTION", "SUPABASE_URL", "SUPABASE_ANON_KEY", "ALLOWED_EMAILS"] as const;

/** Describe the database URL without the password. */
function describeUrl(raw: string | undefined): string {
  if (!raw) return "not set";
  try {
    const u = new URL(raw.trim());
    return `user "${decodeURIComponent(u.username)}", host ${u.hostname}, port ${u.port || "5432"}, database ${u.pathname.slice(1) || "?"}`;
  } catch {
    return "not a valid URL";
  }
}

/** Drizzle wraps driver errors ("Failed query: ..."); the useful message is on `cause`. */
function errorText(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string } };
  return (e.cause?.message ?? e.message ?? String(err)).slice(0, 300);
}

function hintFor(err: unknown): string {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e.code ?? e.cause?.code ?? "";
  const msg = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
  if (code === "28P01" || /password authentication failed/i.test(msg))
    return "Wrong database password. Copy the Transaction pooler string again and replace [YOUR-PASSWORD] with the current database password (reset it under Project Settings > Database if unsure). No spaces or brackets.";
  if (/tenant or user not found/i.test(msg))
    return "The username is wrong. It must be postgres.<project-ref> (with the dot), exactly as Supabase shows it for the pooler.";
  if (code === "42P01" || /relation .* does not exist/i.test(msg))
    return "The tables don't exist yet. Run supabase/setup.sql in the Supabase SQL Editor.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "The host name can't be resolved. Copy the host from Supabase > Connect > Transaction pooler.";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /timeout/i.test(msg))
    return "Can't reach the database. Check the host and that the port is 6543.";
  if (/Invalid URL|invalid url|ERR_INVALID_URL/i.test(msg + code))
    return "DATABASE_URL_TRANSACTION isn't a valid URL. Look for spaces or a missing part.";
  return "See the error above. Check DATABASE_URL_TRANSACTION in Vercel and redeploy after any change.";
}

export async function runHealthChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  checks.push({
    name: "Environment variables",
    ok: missing.length === 0,
    detail: missing.length ? `Missing: ${missing.join(", ")}` : "All required variables are set",
    hint: missing.length ? "Add them in Vercel > Settings > Environment Variables, then redeploy." : undefined,
  });
  if (missing.length) return checks;

  const raw = process.env.DATABASE_URL_TRANSACTION!;
  const url = describeUrl(raw);
  const port = (() => {
    try {
      return new URL(raw.trim()).port;
    } catch {
      return "";
    }
  })();
  checks.push({
    name: "Database URL",
    ok: url !== "not a valid URL" && !/\s/.test(raw.trim()),
    detail: /\s/.test(raw.trim()) ? `Contains a space (${url})` : url,
    hint:
      url === "not a valid URL" || /\s/.test(raw.trim())
        ? "Re-paste the Transaction pooler string with no spaces."
        : port && port !== "6543"
          ? "Port should be 6543 (transaction pooler) for the web app."
          : undefined,
  });

  try {
    env();
  } catch (err) {
    checks.push({ name: "Environment format", ok: false, detail: (err as Error).message.slice(0, 300), hint: "SUPABASE_URL must be a full https:// URL." });
    return checks;
  }

  try {
    await db().execute(sql`select 1`);
    checks.push({ name: "Database connection", ok: true, detail: "Connected" });
  } catch (err) {
    checks.push({ name: "Database connection", ok: false, detail: errorText(err), hint: hintFor(err) });
    return checks;
  }

  try {
    const res = (await db().execute(sql`select (select count(*) from agents)::int as agents, (select count(*) from app_settings)::int as settings`)) as unknown as {
      agents: number;
      settings: number;
    }[];
    const row = res[0];
    const seeded = (row?.agents ?? 0) > 0 && (row?.settings ?? 0) > 0;
    checks.push({
      name: "Tables and seed data",
      ok: seeded,
      detail: `${row?.agents ?? 0} agent(s), settings row ${row?.settings ? "present" : "missing"}`,
      hint: seeded ? undefined : "Run supabase/setup.sql in the Supabase SQL Editor (safe to re-run).",
    });
  } catch (err) {
    checks.push({ name: "Tables and seed data", ok: false, detail: errorText(err), hint: hintFor(err) });
    return checks;
  }

  try {
    const rows = (await db().execute(sql`
      select
        (select min(queued_at) from runs where status = 'queued') as oldest_queued,
        (select max(coalesce(heartbeat_at, finished_at, started_at)) from runs where started_at is not null) as last_activity
    `)) as unknown as { oldest_queued: string | Date | null; last_activity: string | Date | null }[];
    const toDate = (v: string | Date | null | undefined) => (v ? new Date(v) : null);
    const oldest = toDate(rows[0]?.oldest_queued);
    const last = toDate(rows[0]?.last_activity);
    const waitingMin = oldest ? Math.round((Date.now() - oldest.getTime()) / 60_000) : 0;
    const stuck = waitingMin > STUCK_QUEUE_MINUTES;
    checks.push({
      name: "Worker",
      ok: !stuck,
      detail: [
        oldest ? `Oldest queued run waiting ${waitingMin} min` : "No runs waiting",
        last ? `last worker activity ${last.toISOString().replace("T", " ").slice(0, 16)} UTC` : "the worker has never run",
      ].join("; "),
      hint: stuck
        ? "Nothing is picking up runs. Start the worker: either enable the GitHub Actions workflow (add the DATABASE_URL_SESSION and ANTHROPIC_API_KEY repository secrets, see README > Worker on GitHub Actions) or run the Docker image on a server."
        : undefined,
    });
  } catch (err) {
    checks.push({ name: "Worker", ok: false, detail: errorText(err), hint: hintFor(err) });
  }
  return checks;
}
