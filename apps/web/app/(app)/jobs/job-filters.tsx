import { JOB_SORTS, MATCH_STATUSES, type JobsQuery, type JobSort } from "@jf/db";
import Link from "next/link";
import { offerLabel } from "@/lib/format";
import type { Params } from "@/lib/url";

interface Props {
  params: Params;
  query: JobsQuery;
  facets: { sources: string[]; offers: string[]; agents: { id: string; name: string }[] };
  sortLabels: Record<JobSort, string>;
}

const input = "h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm focus:border-zinc-900 focus:outline-none";
const label = "flex flex-col gap-1 text-xs font-medium text-zinc-500";

/** Plain GET form: every filter lives in the URL, so views are shareable and server rendered. */
export function JobFilters({ params, query: q, facets, sortLabels }: Props) {
  const val = (k: keyof JobsQuery) => (q[k] == null ? "" : String(q[k]));
  return (
    <form method="get" className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Agent
          <select name="agent" defaultValue={val("agent")} className={input}>
            <option value="">All</option>
            {facets.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Offer
          <select name="offer" defaultValue={val("offer")} className={input}>
            <option value="">All</option>
            {facets.offers.filter((o) => o !== "none").map((o) => (
              <option key={o} value={o}>
                {offerLabel(o)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Source
          <select name="source" defaultValue={val("source")} className={input}>
            <option value="">All</option>
            {facets.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Status
          <select name="status" defaultValue={q.status} className={input}>
            <option value="active">Active (hide dismissed)</option>
            <option value="all">All</option>
            {MATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Show
          <select name="outcome" defaultValue={q.outcome} className={input}>
            <option value="matched">Matches</option>
            <option value="scored">All scored</option>
          </select>
        </label>
        <label className={label}>
          Total budget $
          <span className="flex items-center gap-1">
            <input name="minBudget" type="number" min={0} placeholder="min" defaultValue={val("minBudget")} className={`${input} w-20`} />
            <span className="text-zinc-400">–</span>
            <input name="maxBudget" type="number" min={0} placeholder="max" defaultValue={val("maxBudget")} className={`${input} w-20`} />
          </span>
        </label>
        <label className={label}>
          Max hours
          <input name="maxHours" type="number" min={0} defaultValue={val("maxHours")} className={`${input} w-20`} />
        </label>
        <label className={label}>
          Max complexity
          <select name="maxComplexity" defaultValue={val("maxComplexity")} className={input}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                ≤ {n}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Posted within (h)
          <input name="postedWithin" type="number" min={1} defaultValue={val("postedWithin")} className={`${input} w-20`} />
        </label>
        <label className={label}>
          Max proposals
          <input name="maxProposals" type="number" min={0} defaultValue={val("maxProposals")} className={`${input} w-20`} />
        </label>
        <label className={label}>
          Payment
          <select name="paymentVerified" defaultValue={q.paymentVerified == null ? "" : q.paymentVerified ? "1" : "0"} className={input}>
            <option value="">Any</option>
            <option value="1">Verified</option>
            <option value="0">Not verified / unknown</option>
          </select>
        </label>
        <label className="flex h-8 items-center gap-1.5 text-sm text-zinc-700">
          <input type="checkbox" name="hideRedFlags" value="1" defaultChecked={q.hideRedFlags === true} />
          Hide red flags
        </label>
        <label className={label}>
          Sort
          <select name="sort" defaultValue={q.sort} className={input}>
            {JOB_SORTS.map((s) => (
              <option key={s} value={s}>
                {sortLabels[s]}
              </option>
            ))}
          </select>
        </label>
        {q.dir && <input type="hidden" name="dir" value={q.dir} />}
        {typeof params.sel === "string" && <input type="hidden" name="sel" value={params.sel} />}
        <div className="flex gap-2">
          <button type="submit" className="h-8 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700">
            Apply
          </button>
          <Link href="/jobs" className="flex h-8 items-center rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-50">
            Reset
          </Link>
        </div>
      </div>
    </form>
  );
}
