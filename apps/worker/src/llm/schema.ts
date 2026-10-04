import { z } from "zod";

/**
 * Shape sent to the API as the structured output format. Kept free of numeric range
 * constraints (not all are supported by structured outputs); ranges are enforced by
 * ScoreOutputSchema below after parsing.
 */
export const ScoreOutputFormatSchema = z.object({
  matched_offer: z.string().describe('Key of the best matching offer, or "none"'),
  fit_score: z.number().describe("0 to 10: how well this job fits the matched offer and our team"),
  reasoning: z.string().describe("At most 2 sentences"),
  red_flags: z.array(z.string()).describe('e.g. "vague scope", "scope creep risk", "underpriced", "unrealistic timeline"'),
  failure_case: z.string().describe("One realistic failure case we would handle, worth naming in a proposal"),
  opener: z.string().describe("One line restating the client's problem in their terms"),
  est_hours_low: z.number(),
  est_hours_high: z.number(),
  complexity: z.number().int().describe("1 (trivial) to 5 (very complex)"),
  est_duration_days: z.number().describe("Calendar days to deliver"),
  budget_confidence: z.enum(["high", "medium", "low"]).describe("How confident we are the budget matches the real scope"),
});

export const ScoreOutputSchema = z
  .object({
    matched_offer: z.string().min(1),
    fit_score: z.number().min(0).max(10),
    reasoning: z.string().min(1).max(600),
    red_flags: z.array(z.string().min(1).max(120)).max(10),
    failure_case: z.string().min(1).max(400),
    opener: z.string().min(1).max(300),
    est_hours_low: z.number().min(0).max(5000),
    est_hours_high: z.number().min(0).max(5000),
    complexity: z.number().int().min(1).max(5),
    est_duration_days: z.number().min(0).max(730),
    budget_confidence: z.enum(["high", "medium", "low"]),
  })
  .refine((o) => o.est_hours_high >= o.est_hours_low, { message: "est_hours_high must be >= est_hours_low" });

export type ScoreOutput = z.infer<typeof ScoreOutputSchema>;
