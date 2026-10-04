export function money(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null) return "—";
  if (opts.compact && Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function budgetLabel(r: { budgetType: string; budgetMin: number | null; budgetMax: number | null }): string {
  if (r.budgetType === "hourly") {
    const range = r.budgetMin != null && r.budgetMax != null && r.budgetMin !== r.budgetMax ? `${money(r.budgetMin)}-${money(r.budgetMax)}` : money(r.budgetMax ?? r.budgetMin);
    return `${range}/hr`;
  }
  if (r.budgetType === "fixed") return money(r.budgetMax ?? r.budgetMin);
  return "Unknown";
}

export function age(date: Date | null | undefined, now = new Date()): string {
  if (!date) return "—";
  const mins = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function dateTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export function hoursRange(low: number | null, high: number | null): string {
  if (low == null && high == null) return "—";
  if (low === high || high == null) return `${low}h`;
  if (low == null) return `${high}h`;
  return `${low}-${high}h`;
}

export function offerLabel(key: string | null | undefined): string {
  if (!key || key === "none") return "—";
  return key
    .split("_")
    .map((w) => (w === "ai" ? "AI" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function duration(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
