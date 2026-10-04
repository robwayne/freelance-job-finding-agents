import { describe, expect, it } from "vitest";
import { DEFAULT_ANCHORS, type PriorityWeights } from "./config";
import { computeEffectiveRate } from "./effective-rate";
import { computePriority, type PriorityInputs } from "./priority";

const NOW = new Date("2026-10-01T12:00:00Z");
const WEIGHTS: PriorityWeights = { rate: 25, pay: 15, complexity: 10, duration: 10, fit: 25, competition: 8, freshness: 7 };

const base: PriorityInputs = {
  budgetType: "fixed",
  budgetMin: 5000,
  budgetMax: 5000,
  estHoursLow: 40,
  estHoursHigh: 60,
  complexity: 2,
  estDurationDays: 10,
  fitScore: 8,
  proposalCount: 5,
  postedAt: new Date(NOW.getTime() - 6 * 3_600_000),
};

describe("computeEffectiveRate", () => {
  it("divides a fixed budget by the midpoint of estimated hours", () => {
    expect(computeEffectiveRate(base)).toEqual({ effectiveRate: 100, totalPay: 5000, hoursMid: 50 });
  });
  it("uses the hourly rate directly and multiplies for total pay", () => {
    expect(
      computeEffectiveRate({ budgetType: "hourly", budgetMin: 50, budgetMax: 70, estHoursLow: 10, estHoursHigh: 30 }),
    ).toEqual({ effectiveRate: 60, totalPay: 1200, hoursMid: 20 });
  });
  it("handles one-sided ranges and unknowns", () => {
    expect(computeEffectiveRate({ ...base, budgetMin: null, estHoursHigh: null }).effectiveRate).toBe(125);
    expect(computeEffectiveRate({ ...base, budgetType: "unknown" })).toMatchObject({ effectiveRate: null, totalPay: null });
    expect(computeEffectiveRate({ ...base, estHoursLow: null, estHoursHigh: null })).toMatchObject({ effectiveRate: null, totalPay: 5000 });
  });
});

describe("computePriority", () => {
  it("computes each component against fixed weights and anchors", () => {
    const r = computePriority(base, WEIGHTS, DEFAULT_ANCHORS, NOW);
    const c = r.components;
    expect(c.rate.value).toBeCloseTo((100 - 40) / 110, 4);
    expect(c.pay.value).toBeCloseTo(Math.log(10) / Math.log(40), 4);
    expect(c.complexity.value).toBe(0.75);
    expect(c.duration.value).toBeCloseTo(35 / 40, 4);
    expect(c.fit.value).toBe(0.8);
    expect(c.competition.value).toBe(0.75);
    expect(c.freshness.value).toBeCloseTo(Math.SQRT1_2, 4);
    expect(c.freshness.raw).toBe(6);
    const expected =
      (25 * (60 / 110) + 15 * (Math.log(10) / Math.log(40)) + 10 * 0.75 + 10 * (35 / 40) + 25 * 0.8 + 8 * 0.75 + 7 * Math.SQRT1_2) ;
    expect(r.priority).toBeCloseTo(expected, 1);
    expect(r.effectiveRate).toBe(100);
    expect(r.totalPay).toBe(5000);
  });

  it("contributions sum to the priority", () => {
    const r = computePriority(base, WEIGHTS, DEFAULT_ANCHORS, NOW);
    const sum = Object.values(r.components).reduce((s, c) => s + c.contribution, 0);
    expect(sum).toBeCloseTo(r.priority, 1);
  });

  it("is 100 for a perfect job and 0 for a terrible one", () => {
    const perfect = computePriority(
      { ...base, budgetMin: 30000, budgetMax: 30000, estHoursLow: 50, estHoursHigh: 50, complexity: 1, estDurationDays: 3, fitScore: 10, proposalCount: 0, postedAt: NOW },
      WEIGHTS,
      DEFAULT_ANCHORS,
      NOW,
    );
    expect(perfect.priority).toBe(100);
    const terrible = computePriority(
      { ...base, budgetMin: 300, budgetMax: 300, estHoursLow: 50, estHoursHigh: 50, complexity: 5, estDurationDays: 90, fitScore: 0, proposalCount: 50, postedAt: new Date(NOW.getTime() - 1000 * 3_600_000) },
      WEIGHTS,
      DEFAULT_ANCHORS,
      NOW,
    );
    expect(terrible.priority).toBeLessThan(0.5);
  });

  it("uses the neutral value for unknown inputs and flags them", () => {
    const r = computePriority(
      { ...base, budgetType: "unknown", budgetMin: null, budgetMax: null, proposalCount: null, postedAt: null },
      WEIGHTS,
      DEFAULT_ANCHORS,
      NOW,
    );
    for (const key of ["rate", "pay", "competition", "freshness"] as const) {
      expect(r.components[key]).toMatchObject({ unknown: true, value: DEFAULT_ANCHORS.unknownNeutral, raw: null });
    }
    expect(r.components.fit.unknown).toBe(false);
  });

  it("weights are relative: only fit weighted gives fit*10", () => {
    const r = computePriority(base, { rate: 0, pay: 0, complexity: 0, duration: 0, fit: 3, competition: 0, freshness: 0 }, DEFAULT_ANCHORS, NOW);
    expect(r.priority).toBe(80);
  });

  it("returns 0 when all weights are zero", () => {
    const zero = { rate: 0, pay: 0, complexity: 0, duration: 0, fit: 0, competition: 0, freshness: 0 };
    expect(computePriority(base, zero, DEFAULT_ANCHORS, NOW).priority).toBe(0);
  });

  it("ranks a higher effective rate above a lower one, all else equal", () => {
    const cheap = computePriority({ ...base, budgetMin: 2500, budgetMax: 2500 }, WEIGHTS, DEFAULT_ANCHORS, NOW);
    const rich = computePriority(base, WEIGHTS, DEFAULT_ANCHORS, NOW);
    expect(rich.priority).toBeGreaterThan(cheap.priority);
  });
});
