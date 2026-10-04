import { MATCH_STATUSES, type getJobDetail } from "@jf/db";
import { PRIORITY_COMPONENTS } from "@jf/scoring";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { Badge, PriorityPill, STATUS_TONE } from "@/components/ui";
import { age, budgetLabel, dateTime, hoursRange, money, offerLabel } from "@/lib/format";
import { setStatusAction } from "../actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;

const COMPONENT_LABELS: Record<string, { label: string; raw: (v: number) => string }> = {
  rate: { label: "Effective rate", raw: (v) => `${money(v)}/h` },
  pay: { label: "Total pay", raw: (v) => money(v) },
  complexity: { label: "Low complexity", raw: (v) => `${v}/5` },
  duration: { label: "Short duration", raw: (v) => `${v} days` },
  fit: { label: "Fit score", raw: (v) => `${v}/10` },
  competition: { label: "Few proposals", raw: (v) => `${v} proposals` },
  freshness: { label: "Freshness", raw: (v) => `${v}h old` },
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-sm text-zinc-900">{value}</div>
    </div>
  );
}

export function JobDetail({ detail, closeHref, now }: { detail: Detail; closeHref: string; now: Date }) {
  const { job, match, history, agentName } = detail;
  const unknown = (v: unknown, s: React.ReactNode) => (v == null ? <span className="text-zinc-400">unknown</span> : s);
  const components = match.priorityComponents;
  const totalWeight = components ? Object.values(components).reduce((s, c) => s + c.weight, 0) : 0;

  return (
    <aside className="h-fit space-y-4 rounded-lg border border-zinc-200 bg-white p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold leading-snug">{job.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{job.source}</span>
            <span>· posted {age(job.postedAt, now)} ago</span>
            <span>· {agentName}</span>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
              Open on {job.source} ↗
            </a>
          </div>
        </div>
        <Link href={closeHref} scroll={false} className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100" aria-label="Close">
          ✕
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {MATCH_STATUSES.map((s) => (
          <form key={s} action={setStatusAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="agentId" value={match.agentId} />
            <input type="hidden" name="status" value={s} />
            <button
              className={`rounded border px-2 py-0.5 text-xs capitalize ${
                match.status === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {s}
            </button>
          </form>
        ))}
        {match.statusChangedBy && (
          <span className="text-xs text-zinc-500">
            by {match.statusChangedBy} · {dateTime(match.statusChangedAt)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-md bg-zinc-50 p-3">
        <Stat label="Priority" value={<PriorityPill value={match.priority} />} />
        <Stat label="Fit" value={match.fitScore == null ? "—" : `${match.fitScore}/10`} />
        <Stat label="Offer" value={offerLabel(match.matchedOffer)} />
        <Stat label="Budget" value={budgetLabel(job)} />
        <Stat label="Effective rate" value={match.effectiveRate == null ? "—" : `${money(match.effectiveRate)}/h`} />
        <Stat label="Total pay" value={money(match.totalPay)} />
        <Stat label="Est. hours" value={hoursRange(match.estHoursLow, match.estHoursHigh)} />
        <Stat label="Duration" value={match.estDurationDays == null ? "—" : `${match.estDurationDays} days`} />
        <Stat label="Complexity" value={match.complexity == null ? "—" : `${match.complexity}/5`} />
        <Stat label="Budget confidence" value={match.budgetConfidence ?? "—"} />
        <Stat label="Proposals" value={unknown(job.proposalCount, job.proposalCount)} />
        <Stat label="Status" value={<Badge tone={STATUS_TONE[match.status]}>{match.status}</Badge>} />
      </div>

      {match.opener && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Opener</h3>
            <CopyButton text={match.opener} />
          </div>
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">{match.opener}</p>
        </div>
      )}

      {match.reasoning && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Reasoning</h3>
          <p className="text-sm text-zinc-800">{match.reasoning}</p>
        </div>
      )}

      {match.failureCase && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Failure case to name</h3>
            <CopyButton text={match.failureCase} />
          </div>
          <p className="text-sm text-zinc-800">{match.failureCase}</p>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Red flags</h3>
        {match.redFlags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {match.redFlags.map((f) => (
              <Badge key={f} tone="amber">
                {f}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">None</p>
        )}
      </div>

      {components && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Why it ranks here</h3>
          <div className="space-y-1.5">
            {PRIORITY_COMPONENTS.map((k) => {
              const c = components[k];
              if (!c) return null;
              const meta = COMPONENT_LABELS[k]!;
              const max = totalWeight > 0 ? (100 * c.weight) / totalWeight : 0;
              return (
                <div key={k} className="grid grid-cols-[8rem_1fr_7.5rem] items-center gap-2 text-xs">
                  <span className="text-zinc-600">{meta.label}</span>
                  <div className="relative h-2 rounded bg-zinc-100" title={`value ${c.value} × weight ${c.weight}`}>
                    <div className="absolute inset-y-0 left-0 rounded bg-zinc-300" style={{ width: `${Math.min(100, max)}%` }} />
                    <div className={`absolute inset-y-0 left-0 rounded ${c.unknown ? "bg-zinc-400" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, c.contribution)}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-zinc-700">
                    +{c.contribution.toFixed(1)}{" "}
                    <span className="text-zinc-400">{c.unknown ? "(unknown)" : c.raw == null ? "" : `(${meta.raw(c.raw)})`}</span>
                  </span>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-zinc-400">
              Dark bar: points contributed. Light bar: the most this component could add with its weight.
            </p>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Client</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Payment" value={unknown(job.paymentVerified, job.paymentVerified ? "verified" : "not verified")} />
          <Stat label="Total spend" value={unknown(job.clientTotalSpend, money(job.clientTotalSpend))} />
          <Stat label="Hires" value={unknown(job.clientHires, job.clientHires)} />
          <Stat label="Rating" value={unknown(job.clientRating, job.clientRating)} />
          <Stat label="Country" value={unknown(job.clientCountry, job.clientCountry)} />
        </div>
        {match.unknownFields.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500">Not provided by source: {match.unknownFields.join(", ").replace(/_/g, " ")}</p>
        )}
      </div>

      {job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.skills.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</h3>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{job.description}</div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Status history</h3>
          <ul className="space-y-0.5 text-xs text-zinc-600">
            {history.map((h) => (
              <li key={h.id}>
                {h.fromStatus ?? "—"} → <span className="font-medium">{h.toStatus}</span> by {h.changedBy} · {dateTime(h.changedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
