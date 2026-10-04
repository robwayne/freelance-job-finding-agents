export type BudgetType = "fixed" | "hourly" | "unknown";

export interface RateInputs {
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  estHoursLow: number | null;
  estHoursHigh: number | null;
}

export interface RateResult {
  /** $/hr we would effectively earn. Null if the budget is unknown. */
  effectiveRate: number | null;
  /** Total expected pay. Null if it cannot be derived. */
  totalPay: number | null;
  hoursMid: number | null;
}

function budgetPoint(min: number | null, max: number | null): number | null {
  if (min != null && max != null) return (min + max) / 2;
  return max ?? min ?? null;
}

export function hoursMidpoint(low: number | null, high: number | null): number | null {
  if (low == null && high == null) return null;
  const lo = low ?? high!;
  const hi = high ?? low!;
  const mid = (lo + hi) / 2;
  return mid > 0 ? mid : null;
}

/**
 * Fixed: rate = budget / midpoint of estimated hours, pay = budget.
 * Hourly: rate = the hourly rate (midpoint of range), pay = rate * midpoint hours.
 */
export function computeEffectiveRate(input: RateInputs): RateResult {
  const hoursMid = hoursMidpoint(input.estHoursLow, input.estHoursHigh);
  const budget = budgetPoint(input.budgetMin, input.budgetMax);
  if (input.budgetType === "unknown" || budget == null || budget <= 0) {
    return { effectiveRate: null, totalPay: null, hoursMid };
  }
  if (input.budgetType === "fixed") {
    return {
      effectiveRate: hoursMid ? budget / hoursMid : null,
      totalPay: budget,
      hoursMid,
    };
  }
  return {
    effectiveRate: budget,
    totalPay: hoursMid ? budget * hoursMid : null,
    hoursMid,
  };
}
