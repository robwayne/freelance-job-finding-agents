import { z } from "zod";

/** Relative importance of each priority component. Stored per agent. */
export const PriorityWeightsSchema = z.object({
  rate: z.number().min(0).default(25),
  pay: z.number().min(0).default(15),
  complexity: z.number().min(0).default(10),
  duration: z.number().min(0).default(10),
  fit: z.number().min(0).default(25),
  competition: z.number().min(0).default(8),
  freshness: z.number().min(0).default(7),
});
export type PriorityWeights = z.infer<typeof PriorityWeightsSchema>;
export const PRIORITY_COMPONENTS = [
  "rate",
  "pay",
  "complexity",
  "duration",
  "fit",
  "competition",
  "freshness",
] as const;
export type PriorityComponentKey = (typeof PRIORITY_COMPONENTS)[number];

/** Scales that turn raw values into 0..1 components. Stored in global settings. */
export const PriorityAnchorsSchema = z.object({
  /** $/hr at or below which the rate component is 0. */
  rateFloor: z.number().min(0).default(40),
  /** $/hr at or above which the rate component is 1. */
  rateTarget: z.number().min(1).default(150),
  /** Total pay at or below which the pay component is 0 (log scale). */
  payFloor: z.number().min(1).default(500),
  /** Total pay at or above which the pay component is 1. */
  payTarget: z.number().min(1).default(20000),
  /** Durations at or under this many days score 1. */
  durationBestDays: z.number().min(0).default(5),
  /** Durations at or over this many days score 0. */
  durationWorstDays: z.number().min(1).default(45),
  /** Proposal count at which the competition component reaches 0. */
  competitionMaxProposals: z.number().min(1).default(20),
  /** Age in hours at which freshness halves. */
  freshnessHalfLifeHours: z.number().min(0.5).default(12),
  /** Component value used when an input is unknown (e.g. no budget given). */
  unknownNeutral: z.number().min(0).max(1).default(0.4),
});
export type PriorityAnchors = z.infer<typeof PriorityAnchorsSchema>;

export const DEFAULT_WEIGHTS: PriorityWeights = PriorityWeightsSchema.parse({});
export const DEFAULT_ANCHORS: PriorityAnchors = PriorityAnchorsSchema.parse({});
