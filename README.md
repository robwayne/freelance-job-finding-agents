# Freelance Job Finder

Agents poll freelance job sources, drop jobs that fail hard filters, score the rest against our offers through the Anthropic API, rank them with a transparent priority formula, and write everything to Postgres. A Next.js dashboard shows the results and controls the agents.

```
             ┌─────────────── apps/worker (VPS, Docker) ────────────────┐
 Upwork  ──► │ fetch → normalize → dedupe → hard filter → score → rank   │ ──► Supabase Postgres ◄── apps/web (Vercel)
 HN      ──► │ every ~15s: schedule due agents, run queued runs          │       (Drizzle)             jobs / agents / runs / settings
             └───────────────────────────────────────────────────────────┘
```

The database is the only interface between the worker and the web app. "Run now" in the UI inserts a queued run, and the worker picks it up on its next tick. The worker has no HTTP API.

**Read only.** Sources only read job listings. Nothing in this codebase submits proposals or takes any action on any platform.

## Layout

| Path | What |
|---|---|
| `apps/worker` | Long-running agent runner, CLI commands, Dockerfile |
| `apps/web` | Next.js 16 dashboard (App Router, Tailwind, server-rendered) |
| `packages/db` | Drizzle schema, migrations, queries shared by both apps |
| `packages/scoring` | Priority calculation (pure functions) |
| `fixtures/` | Sample Upwork GraphQL and HN Algolia responses |

## Quick start (no credentials)

The pipeline runs end to end on fixtures with an offline keyword scorer and no database:

```bash
corepack enable
pnpm install
pnpm worker:once --dry-run --mock-llm
```

Add `ANTHROPIC_API_KEY` to `.env` and drop `--mock-llm` to score with the real model, still without a database.

## Setup

### Database (no local tools needed)

Open Supabase > **SQL Editor**, paste the contents of [`supabase/setup.sql`](supabase/setup.sql) and run it. That one script:

- creates the tables and enables RLS on all of them
- revokes every privilege from the `anon` and `authenticated` roles
- seeds the global settings and the default agent

It's safe to run again, and it never overwrites edits made in the app.

After that, schema changes apply themselves. The worker runs pending migrations and seeds missing defaults every time it starts, and it skips anything `setup.sql` already applied. Set `AUTO_MIGRATE=false` to turn that off.

### Local development (optional)

Requires Node 20+ and pnpm 10.

1. `cp .env.example .env` and fill it in (see below).
2. `pnpm install`
3. `pnpm db:migrate && pnpm db:seed`, or rely on the worker doing both on startup.
4. `pnpm dev` runs the worker and the web app (http://localhost:3000) together.

### Supabase

- **Connection strings:** go to Project Settings > Database > Connection string.
  - Use the **Session pooler** URL (port 5432) for `DATABASE_URL_SESSION`. The worker, migrations and seed use it.
  - Use the **Transaction pooler** URL (port 6543) for `DATABASE_URL_TRANSACTION`. The web app uses it.
  - Both are IPv4 friendly.
- **Auth:**
  - Enable the Email provider under Authentication > Sign In / Providers. Magic links are on by default.
  - Under Authentication > URL Configuration, set the Site URL to your app URL.
  - Add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to Redirect URLs.
- **Optional, cross-device links:** the default link only works in the browser that requested it (PKCE). To open links on another device, edit the Magic Link email template to link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`. The callback route accepts both forms.
- **Allowlist:** `ALLOWED_EMAILS` is checked in three places: before a link is sent, in the auth callback, and on every request by `proxy.ts`. If you also want Supabase itself to reject strangers, create your two users under Authentication > Users and turn off "Allow new users to sign up".
- **Keys:** `SUPABASE_ANON_KEY` takes the publishable key (`sb_publishable_…`) or the legacy anon key. Never use the secret or `service_role` key; the web app doesn't need it. The key and Supabase URL are read only on the server. The browser never receives them and never talks to Supabase directly. Even if someone has the anon key, RLS (enabled, no policies) plus the revoked grants mean it can't read anything.

### Upwork API credentials

Without credentials the Upwork source reads `fixtures/upwork/*.json` (sample data). Untick Upwork on the agent until you've connected a real key.

1. Request a key at https://www.upwork.com/developer/keys/apply, signed in as the account that will own it. Describe it as an internal, read-only job search tool for your agency.
2. **Callback URL:** `https://<your-vercel-domain>/upwork/callback`. The dashboard shows the exact value under Settings > Upwork connection.
3. **Permissions:** only **Common Entities - Read-Only Access** and **Read marketplace Job Postings**.
4. Once approved, add `UPWORK_CLIENT_ID` and `UPWORK_CLIENT_SECRET` in two places:
   - **Vercel** environment variables, then redeploy.
   - **GitHub Actions** secrets, for the worker.
5. In the dashboard, go to **Settings > Upwork connection > Connect Upwork** and approve on Upwork. The tokens are stored in the `integration_tokens` table, and the worker refreshes them automatically.
6. Tick **Upwork** again on the agent.

`pnpm --filter @jf/worker upwork:auth` still does the same authorization from a terminal if you prefer. If your key supports the client credentials grant, set `UPWORK_GRANT_TYPE=client_credentials` and skip the connect step.

Search uses `marketplaceJobPostingsSearch` on `https://api.upwork.com/graphql`, sorted by recency, once per query in Settings > Upwork search queries. Results are merged.

### Hacker News

No setup needed. The worker reads top-level "SEEKING FREELANCER" posts from the latest two "Ask HN: Freelancer? Seeking freelancer?" threads via the Algolia API. HN posts have no client stats or proposal counts, so those fields are marked unknown. The hard filter doesn't reject a job for an unknown field, and the scoring prompt is told which fields are unknown.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Worker and web app together, with reload |
| `pnpm worker:tick` | One scheduler pass, then exit (used by GitHub Actions or cron) |
| `pnpm worker:once` | One run of every enabled agent, recorded in `runs` |
| `pnpm worker:once --dry-run` | Full pipeline, prints results, writes nothing. Works without a database (default agent and settings) |
| `pnpm worker:once --mock-llm` | Offline keyword scorer instead of the API (combine with `--dry-run`) |
| `pnpm worker:once --agent <id>` | Only that agent |
| `pnpm rescore` | Recompute priority for all matches (no model calls) |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / create defaults |
| `pnpm db:generate` | Generate a migration after editing `packages/db/src/schema.ts` |
| `pnpm db:sql` | Regenerate `supabase/setup.sql` from the migrations (commit the result) |
| `pnpm test` | Unit, query (in-process Postgres via PGlite) and end-to-end tests |
| `pnpm typecheck` | Type check every package |

## Configuration: what lives where

- **Settings page (`app_settings` table), shared by all agents:**
  - scoring model, agency profile and extra prompt guidance
  - concurrency, per-run cap and token prices
  - priority scales
  - freshness refresh interval and stale-run timeout
  - whether paused agents can be run manually
  - Upwork mode and search queries, and HN on or off
- **Agent page (`agents` table), per agent:**
  - schedule, sources and hard filters
  - offers, priority weights and match threshold
- **Environment:** secrets and infrastructure only (database URLs, API keys, allowlist).

Every run reads the latest saved settings and agent row from the database when it starts. It never caches them, so a save applies to the next run. Each run stores a snapshot of the exact configuration it used in `runs.config_snapshot`.

Saving new weights or a new threshold rescores that agent's matches. Saving new priority scales rescores all matches. Rescoring is pure computation with no model calls.

## How a run works

1. **Fetch:** every source the agent uses runs independently, with retries and exponential backoff. One failing source is recorded in `runs.errors` and doesn't stop the others.
2. **Normalize** each source's payload into one `Job` shape, validated with zod.
3. **Dedupe:** jobs are stored once in `jobs` (unique on source + external id). A job this agent already evaluated (any `job_matches` row) is skipped.
4. **Hard filter:** rejected jobs get a `job_matches` row with outcome `rejected` and the reasons, so they're never re-evaluated.
5. **Score:** survivors go to the model, freshest first, up to the per-run cap, with bounded concurrency. Structured output is validated with zod.
   - Invalid output gets one retry and is then recorded as outcome `error`.
   - API errors aren't recorded, so the job is retried next run.
6. **Rank:** priority is computed in code (below). The match is `matched` if it has an offer and fit ≥ threshold, otherwise `below_threshold`.
7. **Persist:** match rows, plus stage counts, tokens and cost on the run.

The scheduler queues a run when an agent's interval has elapsed since its last run was queued. A partial unique index allows at most one queued or running run per agent, and runs are claimed with `FOR UPDATE SKIP LOCKED`, so a second worker would be safe. A running run whose heartbeat stops (worker crash) is marked failed.

## Priority formula

Each component is normalized to 0..1, then:

```
priority = 100 × Σ(weightᵢ × componentᵢ) / Σ(weightᵢ)
```

| Component | 0..1 value | Default weight |
|---|---|---|
| rate | (effective rate − 40) / (150 − 40), clamped | 25 |
| pay | log(total / 500) / log(20000 / 500), clamped | 15 |
| complexity | (5 − complexity) / 4 | 10 |
| duration | (45 − days) / (45 − 5), clamped | 10 |
| fit | fit score / 10 | 25 |
| competition | 1 − proposals / 20, clamped | 8 |
| freshness | 0.5 ^ (age hours / 12) | 7 |

- **Effective rate:** for fixed budgets, budget ÷ midpoint of estimated hours. For hourly budgets, the hourly rate (midpoint of the range). Total pay for hourly jobs is rate × midpoint hours.
- **Unknown inputs:** an unknown input (no budget, no proposal count) uses a neutral 0.4 and is flagged.
- **Where values live:** weights are per agent, and the scales (40/150, 500/20000, …) are global settings.
- **Breakdown:** each match stores every component's raw value, normalized value, weight and contribution. The job detail panel shows this breakdown.
- **Freshness:** it decays over time, so the worker recomputes priority for matches under 72h old every 15 minutes (configurable).

## Deployment

### Web app on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `apps/web`. Vercel detects Next.js and the pnpm workspace, and installs from the repo root.
2. Set these environment variables (Production and Preview):
   - `DATABASE_URL_TRANSACTION`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ALLOWED_EMAILS`
   - `APP_URL` (your Vercel or custom domain)
3. Deploy, then add `https://<domain>/auth/callback` to Supabase Redirect URLs and set the Supabase Site URL to the domain.

Vercel deploys production from `main`.

The web app uses the transaction pooler, which is the right choice for serverless functions. Each function instance keeps a small pool (3 connections).

GitHub Pages won't work. It serves static files only, and this app needs a server for auth, database access and server actions. All three must stay server side so that no Supabase key or table data is exposed to the browser.

### Worker on GitHub Actions (no server)

`.github/workflows/worker.yml` runs `pnpm worker:tick` every 15 minutes on GitHub's machines. Each pass queues agents whose interval has elapsed, executes queued runs (including "Run now" from the web app), and exits.

1. In GitHub, open the repo and go to **Settings > Secrets and variables > Actions > New repository secret**. Add:
   - `DATABASE_URL_SESSION`: the Supabase **Session pooler** string (port 5432), with the password filled in.
   - `ANTHROPIC_API_KEY`
   - optionally `UPWORK_CLIENT_ID`, `UPWORK_CLIENT_SECRET` and `UPWORK_REDIRECT_URI`, once your Upwork key is approved.
2. Go to **Actions > Worker > Run workflow** to start the first pass now instead of waiting for the schedule.

Trade-offs compared to a server:
- "Run now" waits for the next pass, up to about 15 minutes. GitHub can also delay scheduled runs at busy times.
- Each pass takes about 1-2 minutes of Actions time. Public repos run free. Private repos on the free plan get 2,000 minutes a month, and every 15 minutes uses more than that. If you hit the limit, change the cron to `*/30` or `0 * * * *`, or move to a server.

### Worker on a VPS

```bash
docker build -f apps/worker/Dockerfile -t job-finder-worker .
docker run -d --name job-finder-worker --restart unless-stopped --env-file .env job-finder-worker
# one-offs
docker run --rm --env-file .env job-finder-worker node dist/cli/once.js --dry-run
docker run --rm --env-file .env job-finder-worker node dist/cli/rescore.js
```

The worker needs `DATABASE_URL_SESSION` and `ANTHROPIC_API_KEY`, plus the Upwork variables once your key is approved. It logs JSON to stdout, one line per stage with `runId`, `agentId`, `stage` and `source`. Set `LOG_PRETTY=1` for human-readable logs. On `SIGTERM` it finishes the current run before exiting.

The worker applies pending migrations on startup, so deploying a new worker image is enough to upgrade the schema. Deploy the worker before the web app when a release changes the schema.

## Tests

`pnpm test` runs without network or credentials:

- `packages/scoring`: effective rate and priority with fixed weights
- `packages/db`: query tests for filter and sort combinations, scheduling and claiming, status history, rescoring, settings, and "new since last visit". These run against in-process Postgres (PGlite) with the real migrations.
- `apps/worker`:
  - hard filter, normalizers and retry unit tests
  - an end-to-end test that runs the worker tick on the fixtures with a mocked model, covering dedupe, failing sources, settings changes and paused agents

## Not in v1 (but not blocked)

- Cloning agents, and creating agents from the UI. The schema and worker already support N agents; only the default is seeded.
- Different source configs per agent. Agents can pick which sources they use, but source settings are global.
- Contra, full proposal drafting, notifications.
