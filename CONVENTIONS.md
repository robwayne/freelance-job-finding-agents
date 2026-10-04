# Project conventions

## Architecture rules

- **The database is the only interface between worker and web.** No HTTP between them. The UI asks the worker to do something by writing a row (e.g. a `queued` run). The worker reports back by writing rows.
- **All DB access is server side.** The web app talks to Postgres only from Server Components, Server Actions and route handlers (`apps/web/lib/db.ts` is `server-only`). Never add `NEXT_PUBLIC_` variables for Supabase or the database. Never create a browser Supabase client.
- **RLS stays on with no policies.** Every new table gets `.enableRLS()` in `packages/db/src/schema.ts`. The app connects as the table owner, which RLS doesn't restrict. `anon` and `authenticated` have no grants (migration `0001`).
- **Config is data.** Per-agent behavior goes on the `agents` row. Behavior shared by all agents goes in `GlobalSettingsSchema` (`packages/db/src/config.ts`) and is edited on the Settings page. Env holds secrets and infrastructure only.
- **Runs read config fresh.** `executeRun` loads the agent and settings from the DB at the start of every run and snapshots them on the run. Don't cache either one in the worker.
- **Sources are read only.** A source implements `fetchJobs(since)` and only reads. Never add code that applies to jobs, sends messages, or mutates anything on a platform.
- **Unknown is not failure.** Normalizers return `null` for fields a source doesn't provide. The hard filter records them in `unknownFields` instead of rejecting, and priority uses the neutral value for them.
- **Priority is computed in code** (`packages/scoring`), never by the model. Store all components on the match so the UI can explain the ranking.

## Code

- TypeScript strict, ESM, Node 20+. Workspace packages ship `.ts` source (Next transpiles them, the worker bundles them with tsup). No build step for packages.
- zod validates everything that crosses a boundary: env, agent and settings JSON, model output, URL search params, server action input.
- Network calls go through `withRetry` / `fetchJson` (`apps/worker/src/lib/retry.ts`), or the Anthropic SDK's own retries.
- Logging: pino, one structured line per stage, with `runId`, `agentId`, `stage` and `source` bindings. No `console.log` in the worker except CLI output.
- Web: Server Components by default. Client components only for interactivity (forms with local state, copy buttons, nav). No component library, no client state library. Filters and sorting live in the URL.
- Tailwind utility classes inline. The shared small pieces are in `apps/web/components/`.

## Database changes

1. Edit `packages/db/src/schema.ts`.
2. `pnpm db:generate` writes a migration to `packages/db/migrations`. Commit it.
3. `pnpm db:sql` regenerates `supabase/setup.sql`. Commit it; a test fails if it's stale.
4. Add queries in `packages/db/src/queries/*` with a PGlite test in `queries.test.ts`.
5. The worker applies the migration on its next start (or run `pnpm db:migrate`).

Hand-written SQL goes in a custom migration (`pnpm --filter @jf/db exec drizzle-kit generate --custom --name <name>`).

## Adding a source

1. Create `apps/worker/src/sources/<id>/` with a client, `normalize.ts` (raw item to `NormalizedJob`), and `index.ts` exporting `create<Id>Source(): Source`.
2. Add the id to `SOURCE_IDS` in `packages/db/src/config.ts` and register it in `sources/registry.ts`.
3. Add fixtures under `fixtures/<id>/` and normalizer tests.

## Checks before pushing

```bash
pnpm typecheck
pnpm test
pnpm --filter @jf/web build
pnpm worker:once --dry-run --mock-llm
```
