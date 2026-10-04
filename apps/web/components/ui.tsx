import type { MatchStatus } from "@jf/db";

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-700",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-transparent ${tones[tone]}`}>{children}</span>;
}

export const STATUS_TONE: Record<MatchStatus, "zinc" | "green" | "amber" | "red" | "blue" | "violet"> = {
  new: "blue",
  saved: "violet",
  applied: "amber",
  won: "green",
  lost: "red",
  dismissed: "zinc",
};

export function RunStatusBadge({ status }: { status: string }) {
  const tone = status === "succeeded" ? "green" : status === "failed" ? "red" : status === "running" ? "blue" : "zinc";
  return <Badge tone={tone}>{status}</Badge>;
}

export function PriorityPill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  const tone = value >= 70 ? "bg-emerald-600" : value >= 50 ? "bg-emerald-500/80" : value >= 35 ? "bg-amber-500/80" : "bg-zinc-400";
  return <span className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-white ${tone}`}>{Math.round(value)}</span>;
}

export function Card({ title, children, actions }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
