import type { Scorer, ScoreRequest, ScoreResult } from "./scorer";
import { validateScore } from "./scorer";

/**
 * Deterministic offline scorer: keyword overlap between the job and each offer. Used by tests
 * and `worker:once --mock-llm` to exercise the pipeline without an API key. Not for real ranking.
 */
export class MockScorer implements Scorer {
  calls = 0;

  async score({ job, offers }: ScoreRequest): Promise<ScoreResult> {
    this.calls++;
    const text = `${job.title} ${job.description}`.toLowerCase();
    const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    let best = { key: "none", hits: 0 };
    for (const offer of offers) {
      const hits = [...words(`${offer.title} ${offer.description}`)].filter((w) => text.includes(w)).length;
      if (hits > best.hits) best = { key: offer.key, hits };
    }
    const fit = Math.min(10, best.hits * 1.5);
    const size = Math.min(5, Math.max(1, Math.round(job.description.length / 600)));
    const output = validateScore(
      {
        matched_offer: best.hits >= 2 ? best.key : "none",
        fit_score: fit,
        reasoning: `Mock score from ${best.hits} keyword overlaps with ${best.key}.`,
        red_flags: /asap|urgent/i.test(text) ? ["unrealistic timeline"] : [],
        failure_case: "Upstream API rate limits during backfill.",
        opener: `You need ${job.title.toLowerCase()}.`,
        est_hours_low: 10 * size,
        est_hours_high: 20 * size,
        complexity: size,
        est_duration_days: 5 * size,
        budget_confidence: job.budgetType === "unknown" ? "low" : "medium",
      },
      offers,
    );
    return { output, inputTokens: 1000, outputTokens: 200, model: "mock" };
  }
}
