import type { AgentFilters } from "@jf/db";
import type { NormalizedJob } from "../sources/types";

export interface FilterResult {
  pass: boolean;
  /** Why the job was rejected (empty when it passes). */
  reasons: string[];
  /** Fields the source didn't provide; checked as "unknown" rather than failing. */
  unknownFields: string[];
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesKeyword(text: string, keyword: string): boolean {
  const pattern = keyword.trim().split(/\s+/).map(escapeRegex).join("[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i").test(text);
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function hardFilter(job: NormalizedJob, f: AgentFilters, now: Date): FilterResult {
  const reasons: string[] = [];
  const unknown: string[] = [];

  if (f.requirePaymentVerified) {
    if (job.paymentVerified == null) unknown.push("payment_verified");
    else if (!job.paymentVerified) reasons.push("Payment not verified");
  }

  if (job.clientTotalSpend == null) unknown.push("client_total_spend");
  else if (job.clientTotalSpend < f.minClientSpend)
    reasons.push(`Client spend ${usd(job.clientTotalSpend)} < ${usd(f.minClientSpend)}`);

  if (job.clientHires == null) unknown.push("client_hires");
  else if (
    job.clientHires >= f.hireSanity.minHires &&
    job.clientTotalSpend != null &&
    job.clientTotalSpend / job.clientHires < f.hireSanity.minSpendPerHire
  ) {
    reasons.push(
      `Client averages ${usd(job.clientTotalSpend / job.clientHires)} per hire over ${job.clientHires} hires (< ${usd(f.hireSanity.minSpendPerHire)})`,
    );
  }

  const top = job.budgetMax ?? job.budgetMin;
  if (job.budgetType === "unknown" || top == null) unknown.push("budget");
  else if (job.budgetType === "fixed" && top < f.minFixedBudget)
    reasons.push(`Fixed budget ${usd(top)} < ${usd(f.minFixedBudget)}`);
  else if (job.budgetType === "hourly" && top < f.minHourlyRate)
    reasons.push(`Hourly rate ${usd(top)}/hr < ${usd(f.minHourlyRate)}/hr`);

  if (job.proposalCount == null) unknown.push("proposal_count");
  else if (job.proposalCount >= f.maxProposals) reasons.push(`${job.proposalCount} proposals (max ${f.maxProposals - 1})`);

  if (job.postedAt == null) unknown.push("posted_at");
  else {
    const ageHours = (now.getTime() - job.postedAt.getTime()) / 3_600_000;
    if (ageHours > f.maxAgeHours) reasons.push(`Posted ${Math.round(ageHours)}h ago (max ${f.maxAgeHours}h)`);
  }

  const text = `${job.title}\n${job.description}`;
  const hits = f.excludedKeywords.filter((k) => matchesKeyword(text, k));
  if (hits.length) reasons.push(`Excluded keyword: ${hits.join(", ")}`);

  return { pass: reasons.length === 0, reasons, unknownFields: unknown };
}
