import {
  PRIORITY_COMPONENTS,
  type PriorityAnchors,
  type PriorityComponentKey,
  type PriorityWeights,
} from "./config";
import { computeEffectiveRate, type BudgetType } from "./effective-rate";

export interface PriorityInputs {
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  estHoursLow: number | null;
  estHoursHigh: number | null;
  complexity: number | null;
  estDurationDays: number | null;
  fitScore: number | null;
  proposalCount: number | null;
  postedAt: Date | null;
}

export interface PriorityComponent {
  /** The raw input (e.g. $/hr, days, proposals). Null when unknown. */
  raw: number | null;
  /** Normalized 0..1 value used in the weighted sum. */
  value: number;
  weight: number;
  /** Points this component added to the 0..100 priority. */
  contribution: number;
  unknown: boolean;
}

export type PriorityComponents = Record<PriorityComponentKey, PriorityComponent>;

export interface PriorityResult {
  priority: number;
  effectiveRate: number | null;
  totalPay: number | null;
  components: PriorityComponents;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const round = (x: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export function computePriority(
  input: PriorityInputs,
  weights: PriorityWeights,
  anchors: PriorityAnchors,
  now: Date = new Date(),
): PriorityResult {
  const { effectiveRate, totalPay } = computeEffectiveRate(input);
  const neutral = anchors.unknownNeutral;

  const values: Record<PriorityComponentKey, { raw: number | null; value: number | null }> = {
    rate: {
      raw: effectiveRate,
      value:
        effectiveRate == null
          ? null
          : clamp01((effectiveRate - anchors.rateFloor) / (anchors.rateTarget - anchors.rateFloor)),
    },
    pay: {
      raw: totalPay,
      value:
        totalPay == null
          ? null
          : totalPay <= anchors.payFloor
            ? 0
            : clamp01(Math.log(totalPay / anchors.payFloor) / Math.log(anchors.payTarget / anchors.payFloor)),
    },
    complexity: {
      raw: input.complexity,
      value: input.complexity == null ? null : clamp01((5 - input.complexity) / 4),
    },
    duration: {
      raw: input.estDurationDays,
      value:
        input.estDurationDays == null
          ? null
          : clamp01(
              (anchors.durationWorstDays - input.estDurationDays) /
                Math.max(1, anchors.durationWorstDays - anchors.durationBestDays),
            ),
    },
    fit: {
      raw: input.fitScore,
      value: input.fitScore == null ? null : clamp01(input.fitScore / 10),
    },
    competition: {
      raw: input.proposalCount,
      value:
        input.proposalCount == null
          ? null
          : clamp01(1 - input.proposalCount / anchors.competitionMaxProposals),
    },
    freshness: (() => {
      if (!input.postedAt) return { raw: null, value: null };
      const ageHours = Math.max(0, (now.getTime() - input.postedAt.getTime()) / 3_600_000);
      return { raw: round(ageHours, 1), value: 0.5 ** (ageHours / anchors.freshnessHalfLifeHours) };
    })(),
  };

  const totalWeight = PRIORITY_COMPONENTS.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  const components = {} as PriorityComponents;
  let sum = 0;
  for (const key of PRIORITY_COMPONENTS) {
    const { raw, value } = values[key];
    const unknown = value == null;
    const v = unknown ? neutral : value;
    const w = Math.max(0, weights[key]);
    const contribution = totalWeight > 0 ? (100 * w * v) / totalWeight : 0;
    sum += contribution;
    components[key] = {
      raw: raw == null ? null : round(raw),
      value: round(v, 4),
      weight: w,
      contribution: round(contribution),
      unknown,
    };
  }

  return {
    priority: round(sum),
    effectiveRate: effectiveRate == null ? null : round(effectiveRate),
    totalPay: totalPay == null ? null : round(totalPay),
    components,
  };
}
