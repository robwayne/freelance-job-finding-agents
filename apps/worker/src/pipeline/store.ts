import {
  evaluatedJobIds,
  existingJobIds,
  upsertJobs,
  upsertMatch,
  type Database,
  type NewJob,
  type NewJobMatch,
} from "@jf/db";
import { randomUUID } from "node:crypto";

/** What the pipeline needs from persistence. DB-backed normally; in-memory for --dry-run. */
export interface PipelineStore {
  upsertJobs(rows: NewJob[]): Promise<Map<string, string>>;
  evaluatedJobIds(agentId: string, jobIds: string[]): Promise<Set<string>>;
  saveMatch(row: NewJobMatch): Promise<void>;
}

export function dbStore(db: Database): PipelineStore {
  return {
    upsertJobs: (rows) => upsertJobs(db, rows),
    evaluatedJobIds: (agentId, ids) => evaluatedJobIds(db, agentId, ids),
    saveMatch: (row) => upsertMatch(db, row),
  };
}

/**
 * Dry-run store: reads which jobs the agent already evaluated from the DB when one is
 * available (so the dry run sees what a real run would), but never writes.
 */
export function memoryStore(db: Database | null): PipelineStore & { matches: NewJobMatch[] } {
  const ids = new Map<string, string>();
  const matches: NewJobMatch[] = [];
  return {
    matches,
    async upsertJobs(rows) {
      const out = db ? await existingJobIds(db, rows) : new Map<string, string>();
      for (const r of rows) {
        const key = `${r.source}:${r.externalId}`;
        if (!out.has(key)) {
          if (!ids.has(key)) ids.set(key, randomUUID());
          out.set(key, ids.get(key)!);
        }
      }
      return out;
    },
    async evaluatedJobIds(agentId, jobIds) {
      return db ? evaluatedJobIds(db, agentId, jobIds) : new Set();
    },
    async saveMatch(row) {
      matches.push(row);
    },
  };
}
