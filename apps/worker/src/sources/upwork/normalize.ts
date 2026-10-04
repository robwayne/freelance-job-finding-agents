import type { NormalizedJob } from "../types";
import type { UpworkJobNode } from "./query";

const money = (m: { rawValue?: string | number | null } | null | undefined): number | null => {
  if (m?.rawValue == null || m.rawValue === "") return null;
  const n = Number(m.rawValue);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Like money() but keeps 0 (a client with $0 spend is meaningful, unlike a $0 budget). */
const amountOrNull = (m: { rawValue?: string | number | null } | null | undefined): number | null => {
  if (m?.rawValue == null || m.rawValue === "") return null;
  const n = Number(m.rawValue);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;

export function upworkJobUrl(node: Pick<UpworkJobNode, "ciphertext" | "id">): string {
  const key = node.ciphertext ?? `~${node.id}`;
  return `https://www.upwork.com/jobs/${key}`;
}

export function normalizeUpworkJob(node: UpworkJobNode): NormalizedJob {
  if (!node.id || !node.title) throw new Error("Upwork job missing id or title");
  const hourlyMin = money(node.hourlyBudgetMin);
  const hourlyMax = money(node.hourlyBudgetMax);
  const fixed = money(node.amount);
  const isHourly = hourlyMin != null || hourlyMax != null || /hourly/i.test(node.hourlyBudgetType ?? "");

  let budgetType: NormalizedJob["budgetType"] = "unknown";
  let budgetMin: number | null = null;
  let budgetMax: number | null = null;
  if (isHourly && (hourlyMin != null || hourlyMax != null)) {
    budgetType = "hourly";
    budgetMin = hourlyMin ?? hourlyMax;
    budgetMax = hourlyMax ?? hourlyMin;
  } else if (fixed != null) {
    budgetType = "fixed";
    budgetMin = fixed;
    budgetMax = fixed;
  }

  const verification = node.client?.verificationStatus;
  const posted = node.publishedDateTime ?? node.createdDateTime;
  const postedAt = posted ? new Date(posted) : null;

  return {
    externalId: node.id,
    source: "upwork",
    url: upworkJobUrl(node),
    title: node.title.trim(),
    description: (node.description ?? "").trim(),
    budgetType,
    budgetMin,
    budgetMax,
    paymentVerified: verification == null ? null : verification.toUpperCase() === "VERIFIED",
    clientTotalSpend: amountOrNull(node.client?.totalSpent),
    clientHires: intOrNull(node.client?.totalHires),
    clientRating: typeof node.client?.totalFeedback === "number" ? node.client.totalFeedback : null,
    clientCountry: node.client?.location?.country ?? null,
    proposalCount: intOrNull(node.totalApplicants),
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    skills: (node.skills ?? []).map((s) => s.prettyName ?? s.name ?? "").filter(Boolean),
    raw: node,
  };
}
