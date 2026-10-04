import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { GlobalSettings, Offer } from "@jf/db";
import type { NormalizedJob } from "../sources/types";
import { buildJobPrompt, buildSystemPrompt } from "./prompt";
import { ScoreOutputFormatSchema, ScoreOutputSchema, type ScoreOutput } from "./schema";

export interface ScoreRequest {
  job: NormalizedJob;
  unknownFields: string[];
  offers: Offer[];
  settings: GlobalSettings;
}

export interface ScoreResult {
  output: ScoreOutput;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface Scorer {
  score(req: ScoreRequest): Promise<ScoreResult>;
}

/** Validates model output and normalizes offer keys. Throws on invalid output. */
export function validateScore(raw: unknown, offers: Offer[]): ScoreOutput {
  const out = ScoreOutputSchema.parse(raw);
  const keys = new Set(offers.map((o) => o.key));
  const offer = out.matched_offer.trim().toLowerCase();
  return { ...out, matched_offer: keys.has(offer) ? offer : "none" };
}

export function costUsd(inputTokens: number, outputTokens: number, settings: GlobalSettings): number {
  return (inputTokens * settings.scoring.inputCostPerMTok + outputTokens * settings.scoring.outputCostPerMTok) / 1_000_000;
}

export class AnthropicScorer implements Scorer {
  private client: Anthropic;

  constructor(apiKey?: string) {
    // The SDK retries 408/409/429/5xx and connection errors with backoff.
    this.client = new Anthropic({ apiKey, maxRetries: 4, timeout: 60_000 });
  }

  async score(req: ScoreRequest): Promise<ScoreResult> {
    const { settings } = req;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastError: unknown;
    // One extra attempt when the output parses but fails validation.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.messages.parse({
        model: settings.scoring.model,
        max_tokens: settings.scoring.maxOutputTokens,
        system: buildSystemPrompt(req.offers, settings),
        messages: [{ role: "user", content: buildJobPrompt(req.job, req.unknownFields) }],
        output_config: { format: zodOutputFormat(ScoreOutputFormatSchema) },
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      if (response.stop_reason === "refusal") {
        lastError = new Error("Model declined to score this job");
        break;
      }
      try {
        const output = validateScore(response.parsed_output, req.offers);
        return { output, inputTokens, outputTokens, model: response.model };
      } catch (err) {
        lastError = err;
      }
    }
    throw Object.assign(new Error(`Invalid scoring output: ${(lastError as Error)?.message ?? "unknown"}`), {
      inputTokens,
      outputTokens,
    });
  }
}
