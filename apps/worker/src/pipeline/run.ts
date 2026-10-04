import type { AgentConfig, GlobalSettings, NewJob, NewJobMatch, RunError, RunProgress } from "@jf/db";
import { computePriority, type PriorityResult } from "@jf/scoring";
import { costUsd, type Scorer } from "../llm/scorer";
import type { ScoreOutput } from "../llm/schema";
import type { Logger } from "../lib/logger";
import { mapLimit } from "../lib/retry";
import { jobKey, type NormalizedJob, type Source } from "../sources/types";
import { hardFilter } from "./hard-filter";
import type { PipelineStore } from "./store";

export interface PipelineDeps {
  store: PipelineStore;
  sources: Source[];
  scorer: Scorer;
  logger: Logger;
  now?: () => Date;
  runId?: string | null;
  /** Called after each stage so the runs table shows live progress. */
  onProgress?: (p: RunProgress) => Promise<void>;
}

export interface ScoredJob {
  job: NormalizedJob;
  jobId: string;
  output: ScoreOutput;
  priority: PriorityResult;
  matched: boolean;
}

export interface PipelineResult {
  fetched: number;
  newJobs: number;
  filtered: number;
  scored: number;
  matched: number;
  deferred: number;
  errors: RunError[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  rejected: { job: NormalizedJob; reasons: string[] }[];
  results: ScoredJob[];
}

function toJobRow(j: NormalizedJob): NewJob {
  return {
    source: j.source,
    externalId: j.externalId,
    url: j.url,
    title: j.title,
    description: j.description,
    skills: j.skills,
    budgetType: j.budgetType,
    budgetMin: j.budgetMin,
    budgetMax: j.budgetMax,
    paymentVerified: j.paymentVerified,
    clientTotalSpend: j.clientTotalSpend,
    clientHires: j.clientHires,
    clientRating: j.clientRating,
    clientCountry: j.clientCountry,
    proposalCount: j.proposalCount,
    postedAt: j.postedAt,
    raw: j.raw as NewJob["raw"],
  };
}

/** fetch -> normalize -> dedupe -> hard filter -> LLM score -> priority -> persist */
export async function runPipeline(agent: AgentConfig, settings: GlobalSettings, deps: PipelineDeps): Promise<PipelineResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.logger.child({ agentId: agent.id, runId: deps.runId ?? undefined });
  const errors: RunError[] = [];
  const addError = (e: Omit<RunError, "at">) => {
    errors.push({ ...e, at: now().toISOString() });
  };
  const result: PipelineResult = {
    fetched: 0, newJobs: 0, filtered: 0, scored: 0, matched: 0, deferred: 0,
    errors, inputTokens: 0, outputTokens: 0, costUsd: 0, rejected: [], results: [],
  };
  const progress = async () =>
    deps.onProgress?.({
      fetched: result.fetched,
      newJobs: result.newJobs,
      filtered: result.filtered,
      scored: result.scored,
      matched: result.matched,
      errors,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });

  // 1. Fetch + normalize. Sources run independently; one failing doesn't stop the rest.
  const since = new Date(now().getTime() - agent.filters.maxAgeHours * 3_600_000);
  const sources = deps.sources.filter((s) => agent.sources.includes(s.id));
  const fetchStart = Date.now();
  const settled = await Promise.allSettled(sources.map((s) => s.fetchJobs(since, { logger: log.child({ source: s.id }), now: now() })));
  const fetched: NormalizedJob[] = [];
  settled.forEach((r, i) => {
    const source = sources[i]!.id;
    if (r.status === "fulfilled") {
      log.info({ stage: "fetch", source, count: r.value.jobs.length, skipped: r.value.skipped, mode: r.value.mode }, "fetched");
      fetched.push(...r.value.jobs);
      if (r.value.skipped) addError({ stage: "normalize", source, message: `${r.value.skipped} item(s) failed normalization` });
    } else {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      log.error({ stage: "fetch", source, err: message }, "source failed");
      addError({ stage: "fetch", source, message });
    }
  });
  result.fetched = fetched.length;
  log.info({ stage: "fetch", total: fetched.length, ms: Date.now() - fetchStart }, "fetch complete");

  // 2. Dedupe within the batch, store jobs once, skip ones this agent already evaluated.
  const unique = new Map<string, NormalizedJob>();
  for (const j of fetched) if (!unique.has(jobKey(j))) unique.set(jobKey(j), j);
  const jobs = [...unique.values()];
  const idByKey = await deps.store.upsertJobs(jobs.map(toJobRow));
  const seen = await deps.store.evaluatedJobIds(agent.id, [...idByKey.values()]);
  const fresh = jobs.filter((j) => {
    const id = idByKey.get(jobKey(j));
    return id && !seen.has(id);
  });
  result.newJobs = fresh.length;
  log.info({ stage: "dedupe", unique: jobs.length, new: fresh.length }, "dedupe complete");

  // 3. Hard filter. Rejections are stored so they're never re-evaluated.
  const survivors: { job: NormalizedJob; jobId: string; unknownFields: string[] }[] = [];
  for (const job of fresh) {
    const jobId = idByKey.get(jobKey(job))!;
    const f = hardFilter(job, agent.filters, now());
    if (f.pass) {
      survivors.push({ job, jobId, unknownFields: f.unknownFields });
    } else {
      result.rejected.push({ job, reasons: f.reasons });
      await deps.store.saveMatch({
        jobId,
        agentId: agent.id,
        runId: deps.runId ?? null,
        outcome: "rejected",
        filterReasons: f.reasons,
        unknownFields: f.unknownFields,
      });
    }
  }
  result.filtered = survivors.length;
  log.info({ stage: "filter", passed: survivors.length, rejected: result.rejected.length }, "hard filter complete");
  await progress();

  // 4. Score the freshest survivors, capped per run. The rest are picked up next run.
  survivors.sort((a, b) => (b.job.postedAt?.getTime() ?? 0) - (a.job.postedAt?.getTime() ?? 0));
  const toScore = survivors.slice(0, settings.scoring.maxJobsPerRun);
  result.deferred = survivors.length - toScore.length;
  if (result.deferred) log.info({ stage: "score", deferred: result.deferred }, "per-run scoring cap reached");

  await mapLimit(toScore, settings.scoring.maxConcurrency, async ({ job, jobId, unknownFields }) => {
    const jobLog = log.child({ stage: "score", source: job.source, externalId: job.externalId });
    try {
      const scored = await deps.scorer.score({ job, unknownFields, offers: agent.offers, settings });
      result.inputTokens += scored.inputTokens;
      result.outputTokens += scored.outputTokens;
      result.scored++;
      const o = scored.output;
      const priority = computePriority(
        {
          budgetType: job.budgetType,
          budgetMin: job.budgetMin,
          budgetMax: job.budgetMax,
          estHoursLow: o.est_hours_low,
          estHoursHigh: o.est_hours_high,
          complexity: o.complexity,
          estDurationDays: o.est_duration_days,
          fitScore: o.fit_score,
          proposalCount: job.proposalCount,
          postedAt: job.postedAt,
        },
        agent.weights,
        settings.priority,
        now(),
      );
      const matched = o.matched_offer !== "none" && o.fit_score >= agent.scoreThreshold;
      if (matched) result.matched++;
      const row: NewJobMatch = {
        jobId,
        agentId: agent.id,
        runId: deps.runId ?? null,
        outcome: matched ? "matched" : "below_threshold",
        unknownFields,
        matchedOffer: o.matched_offer,
        fitScore: o.fit_score,
        reasoning: o.reasoning,
        redFlags: o.red_flags,
        failureCase: o.failure_case,
        opener: o.opener,
        estHoursLow: o.est_hours_low,
        estHoursHigh: o.est_hours_high,
        complexity: o.complexity,
        estDurationDays: o.est_duration_days,
        budgetConfidence: o.budget_confidence,
        effectiveRate: priority.effectiveRate,
        totalPay: priority.totalPay,
        priority: priority.priority,
        priorityComponents: priority.components,
        priorityComputedAt: now(),
        model: scored.model,
        inputTokens: scored.inputTokens,
        outputTokens: scored.outputTokens,
        scoredAt: now(),
      };
      await deps.store.saveMatch(row);
      result.results.push({ job, jobId, output: o, priority, matched });
      jobLog.debug({ fit: o.fit_score, priority: priority.priority, matched }, "scored");
    } catch (err) {
      const e = err as Error & { inputTokens?: number; outputTokens?: number };
      result.inputTokens += e.inputTokens ?? 0;
      result.outputTokens += e.outputTokens ?? 0;
      jobLog.error({ err: e.message }, "scoring failed");
      addError({ stage: "score", source: job.source, jobId, message: e.message });
      // Invalid model output is recorded so we don't pay for it again every run;
      // transient API errors are not, so the job is retried next run.
      if (e.message.startsWith("Invalid scoring output") || e.message.includes("declined")) {
        await deps.store.saveMatch({
          jobId,
          agentId: agent.id,
          runId: deps.runId ?? null,
          outcome: "error",
          unknownFields,
          reasoning: e.message.slice(0, 500),
        });
      }
    }
  });

  result.costUsd = costUsd(result.inputTokens, result.outputTokens, settings);
  result.results.sort((a, b) => b.priority.priority - a.priority.priority);
  log.info(
    {
      stage: "done",
      fetched: result.fetched,
      new: result.newJobs,
      filtered: result.filtered,
      scored: result.scored,
      matched: result.matched,
      errors: errors.length,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: Number(result.costUsd.toFixed(4)),
    },
    "pipeline complete",
  );
  await progress();
  return result;
}
