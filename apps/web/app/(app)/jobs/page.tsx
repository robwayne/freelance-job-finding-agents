import {
  getJobDetail,
  getJobFacets,
  JOB_SORT_LABELS,
  listJobs,
  parseJobsQuery,
  touchJobsVisit,
  type JobSort,
} from "@jf/db";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { age, budgetLabel, hoursRange, money, offerLabel } from "@/lib/format";
import { withParams, type Params } from "@/lib/url";
import { Badge, PriorityPill, STATUS_TONE } from "@/components/ui";
import { JobDetail } from "./job-detail";
import { JobFilters } from "./job-filters";

export const metadata = { title: "Jobs" };

const COLUMNS: { label: string; sort?: JobSort; className?: string }[] = [
  { label: "Title" },
  { label: "Offer" },
  { label: "Priority", sort: "priority", className: "text-right" },
  { label: "Fit", sort: "fit", className: "text-right" },
  { label: "Budget", sort: "budget", className: "text-right" },
  { label: "Eff. rate", sort: "rate", className: "text-right" },
  { label: "Est. hours", sort: "hours", className: "text-right" },
  { label: "Proposals", sort: "proposals", className: "text-right" },
  { label: "Posted", sort: "posted", className: "text-right" },
  { label: "Status" },
  { label: "" },
];

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const email = await requireUser();
  const params = (await searchParams) as Params;
  const q = parseJobsQuery(params);
  const now = new Date();

  const [{ rows, total }, facets, newCutoff] = await Promise.all([
    listJobs(db(), q, now),
    getJobFacets(db()),
    touchJobsVisit(db(), email, now),
  ]);

  const sel = typeof params.sel === "string" ? params.sel.split(":") : null;
  const detail = sel && sel.length === 2 ? await getJobDetail(db(), sel[0]!, sel[1]!) : null;
  const isNew = (matchedAt: Date) => newCutoff != null && matchedAt > newCutoff;
  const newCount = rows.filter((r) => isNew(r.matchedAt)).length;
  const pages = Math.max(1, Math.ceil(total / q.pageSize));
  const sortHref = (sort: JobSort) =>
    withParams(params, { sort, dir: q.sort === sort ? (q.dir === "asc" ? "desc" : q.dir === "desc" ? "asc" : undefined) : undefined, page: undefined });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold">Jobs</h1>
        <span className="text-sm text-zinc-500">
          {total} {q.outcome === "matched" ? "matches" : "scored jobs"}
        </span>
        {newCount > 0 && <Badge tone="blue">{newCount} new since last visit</Badge>}
      </div>

      <JobFilters params={params} query={q} facets={facets} sortLabels={JOB_SORT_LABELS} />

      <div className={`grid gap-4 ${detail ? "xl:grid-cols-[minmax(0,1fr)_520px]" : ""}`}>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label} className={`whitespace-nowrap px-3 py-2 font-medium ${c.className ?? ""}`}>
                    {c.sort ? (
                      <Link href={sortHref(c.sort)} className={`hover:text-zinc-900 ${q.sort === c.sort ? "text-zinc-900" : ""}`}>
                        {c.label}
                        {q.sort === c.sort ? ((q.dir ?? (c.sort === "hours" || c.sort === "proposals" ? "asc" : "desc")) === "asc" ? " ↑" : " ↓") : ""}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-zinc-500">
                    No jobs match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const key = `${r.jobId}:${r.agentId}`;
                const selected = params.sel === key;
                return (
                  <tr key={key} className={selected ? "bg-sky-50" : "hover:bg-zinc-50"}>
                    <td className="max-w-[28rem] px-3 py-2">
                      <Link href={withParams(params, { sel: key })} scroll={false} className="block">
                        <div className="flex items-center gap-1.5">
                          {isNew(r.matchedAt) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" title="New since last visit" />}
                          <span className="truncate font-medium text-zinc-900">{r.title}</span>
                        </div>
                        <div className="mt-0.5 flex gap-2 text-xs text-zinc-500">
                          <span>{r.source}</span>
                          {facets.agents.length > 1 && <span>· {r.agentName}</span>}
                          {r.redFlags.length > 0 && <span className="text-amber-700">· {r.redFlags.length} red flag{r.redFlags.length > 1 ? "s" : ""}</span>}
                          {r.outcome === "below_threshold" && <span>· below threshold</span>}
                        </div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{offerLabel(r.matchedOffer)}</td>
                    <td className="px-3 py-2 text-right">
                      <PriorityPill value={r.priority} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.fitScore ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      <div>{budgetLabel(r)}</div>
                      {r.budgetType === "hourly" && r.totalPay != null && <div className="text-xs text-zinc-500">~{money(r.totalPay, { compact: true })} total</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.effectiveRate == null ? "—" : `${money(r.effectiveRate)}/h`}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{hoursRange(r.estHoursLow, r.estHoursHigh)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.proposalCount ?? "?"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">{age(r.postedAt, now)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 hover:underline">
                        Open ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 text-xs text-zinc-600">
              <span>
                Page {q.page} of {pages}
              </span>
              <div className="flex gap-2">
                {q.page > 1 && <Link className="rounded border px-2 py-1 hover:bg-zinc-50" href={withParams(params, { page: q.page - 1 })}>Previous</Link>}
                {q.page < pages && <Link className="rounded border px-2 py-1 hover:bg-zinc-50" href={withParams(params, { page: q.page + 1 })}>Next</Link>}
              </div>
            </div>
          )}
        </div>

        {detail && <JobDetail detail={detail} closeHref={withParams(params, { sel: undefined })} now={now} />}
      </div>
    </div>
  );
}
