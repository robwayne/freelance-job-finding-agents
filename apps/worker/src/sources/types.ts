import type { SourceId } from "@jf/db";
import { z } from "zod";
import type { Logger } from "../lib/logger";

/** A job as every source must produce it. Null means the source didn't provide the field. */
export const NormalizedJobSchema = z.object({
  externalId: z.string().min(1),
  source: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string(),
  budgetType: z.enum(["fixed", "hourly", "unknown"]),
  budgetMin: z.number().nonnegative().nullable(),
  budgetMax: z.number().nonnegative().nullable(),
  paymentVerified: z.boolean().nullable(),
  clientTotalSpend: z.number().nonnegative().nullable(),
  clientHires: z.number().int().nonnegative().nullable(),
  clientRating: z.number().nullable(),
  clientCountry: z.string().nullable(),
  proposalCount: z.number().int().nonnegative().nullable(),
  postedAt: z.date().nullable(),
  skills: z.array(z.string()),
  raw: z.unknown(),
});
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

export interface FetchContext {
  logger: Logger;
  now: Date;
}

export interface FetchResult {
  jobs: NormalizedJob[];
  /** Items the source returned that failed normalization. */
  skipped: number;
  /** Human-readable note, e.g. "fixture mode". */
  mode?: string;
}

export interface Source {
  id: SourceId;
  /** Return jobs posted at or after `since`. Read-only: sources never write to any platform. */
  fetchJobs(since: Date, ctx: FetchContext): Promise<FetchResult>;
}

export const jobKey = (j: { source: string; externalId: string }) => `${j.source}:${j.externalId}`;

/** Normalize each raw item, counting (not throwing on) the ones that fail. */
export function normalizeAll<T>(
  items: T[],
  normalize: (item: T) => NormalizedJob | null,
  logger: Logger,
): { jobs: NormalizedJob[]; skipped: number } {
  const jobs: NormalizedJob[] = [];
  let skipped = 0;
  for (const item of items) {
    try {
      const job = normalize(item);
      if (!job) continue;
      jobs.push(NormalizedJobSchema.parse(job));
    } catch (err) {
      skipped++;
      logger.warn({ err: (err as Error).message }, "skipping job that failed normalization");
    }
  }
  return { jobs, skipped };
}
