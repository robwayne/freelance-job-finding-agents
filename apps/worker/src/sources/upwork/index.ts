import type { Database } from "@jf/db";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "../../lib/env";
import { fetchJson } from "../../lib/retry";
import { normalizeAll, type FetchContext, type FetchResult, type NormalizedJob, type Source } from "../types";
import { normalizeUpworkJob } from "./normalize";
import { getUpworkAccessToken, hasUpworkCredentials } from "./oauth";
import { JOB_SEARCH_QUERY, type UpworkJobNode, type UpworkSearchResponse } from "./query";

export const UPWORK_GRAPHQL_URL = "https://api.upwork.com/graphql";

export interface UpworkSourceOptions {
  mode: "auto" | "live" | "fixture";
  searchQueries: string[];
  fixturesDir: string;
  db: Database | null;
  pageSize?: number;
  maxPagesPerQuery?: number;
}

export function resolveUpworkMode(mode: UpworkSourceOptions["mode"]): "live" | "fixture" {
  if (mode === "auto") return hasUpworkCredentials() ? "live" : "fixture";
  return mode;
}

export function createUpworkSource(opts: UpworkSourceOptions): Source {
  const mode = resolveUpworkMode(opts.mode);
  return {
    id: "upwork",
    async fetchJobs(since, ctx) {
      const nodes = mode === "fixture" ? await readFixtureNodes(opts.fixturesDir, ctx.now) : await searchLive(opts, since, ctx);
      const { jobs, skipped } = normalizeAll(nodes, normalizeUpworkJob, ctx.logger);
      return { jobs: jobs.filter((j) => !j.postedAt || j.postedAt >= since), skipped, mode };
    },
  };
}

async function searchLive(opts: UpworkSourceOptions, since: Date, ctx: FetchContext): Promise<UpworkJobNode[]> {
  const token = await getUpworkAccessToken(opts.db, ctx.now);
  const daysPosted = Math.max(1, Math.ceil((ctx.now.getTime() - since.getTime()) / 86_400_000));
  const byId = new Map<string, UpworkJobNode>();
  const queries = opts.searchQueries.length ? opts.searchQueries : [""];

  for (const searchExpression of queries) {
    let after: string | null = null;
    for (let page = 0; page < (opts.maxPagesPerQuery ?? 2); page++) {
      const variables = {
        marketPlaceJobFilter: {
          ...(searchExpression ? { searchExpression_eq: searchExpression } : {}),
          daysPosted_eq: daysPosted,
          pagination_eq: { first: opts.pageSize ?? 50, ...(after ? { after } : {}) },
        },
        searchType: "USER_JOBS_SEARCH",
        sortAttributes: [{ field: "RECENCY", sortOrder: "DESC" }],
      };
      const res: UpworkSearchResponse = await fetchJson<UpworkSearchResponse>(
        UPWORK_GRAPHQL_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(env.UPWORK_TENANT_ID ? { "X-Upwork-API-TenantId": env.UPWORK_TENANT_ID } : {}),
          },
          body: JSON.stringify({ query: JOB_SEARCH_QUERY, variables }),
        },
        { onRetry: (err, attempt) => ctx.logger.warn({ attempt, err: String(err) }, "retrying Upwork search") },
      );
      if (res.errors?.length) throw new Error(`Upwork GraphQL error: ${res.errors.map((e) => e.message).join("; ")}`);
      const conn = res.data?.marketplaceJobPostingsSearch;
      for (const edge of conn?.edges ?? []) byId.set(edge.node.id, edge.node);
      ctx.logger.debug({ searchExpression, page, count: conn?.edges?.length ?? 0 }, "upwork page");
      if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
  }
  return [...byId.values()];
}

/**
 * Reads saved GraphQL responses from fixtures/upwork/*.json. Timestamps are shifted so the
 * newest job was posted one hour ago, keeping relative ages, so the age filter behaves as live.
 */
export async function readFixtureNodes(dir: string, now: Date): Promise<UpworkJobNode[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const nodes: UpworkJobNode[] = [];
  for (const file of files) {
    const body = JSON.parse(await readFile(join(dir, file), "utf8")) as UpworkSearchResponse;
    for (const edge of body.data?.marketplaceJobPostingsSearch?.edges ?? []) nodes.push(edge.node);
  }
  const times = nodes.map((n) => Date.parse(n.publishedDateTime ?? n.createdDateTime ?? "")).filter(Number.isFinite);
  if (times.length === 0) return nodes;
  const shift = now.getTime() - 3_600_000 - Math.max(...times);
  const move = (s?: string | null) => (s ? new Date(Date.parse(s) + shift).toISOString() : s);
  return nodes.map((n) => ({ ...n, publishedDateTime: move(n.publishedDateTime), createdDateTime: move(n.createdDateTime) }));
}

/** FIXTURES_DIR, or the nearest `fixtures/` directory walking up from the working directory. */
export function fixturesPath(sub: string): string {
  if (env.FIXTURES_DIR) return join(env.FIXTURES_DIR, sub);
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "fixtures"))) return join(dir, "fixtures", sub);
    dir = dirname(dir);
  }
  return join(process.cwd(), "fixtures", sub);
}

export type { NormalizedJob, FetchResult };
