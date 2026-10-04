import { listAgents, listRuns } from "@jf/db";
import Link from "next/link";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime, duration } from "@/lib/format";
import { withParams, type Params } from "@/lib/url";
import { RunStatusBadge } from "@/components/ui";

export const metadata = { title: "Runs" };

const PAGE = 50;

export default async function RunsPage({ searchParams }: PageProps<"/runs">) {
  await requireUser();
  const params = (await searchParams) as Params;
  const agentId = z.string().uuid().safeParse(params.agent).data;
  const page = Math.max(1, Number(params.page) || 1);
  const [rows, agents] = await Promise.all([
    listRuns(db(), { agentId, limit: PAGE + 1, offset: (page - 1) * PAGE }),
    listAgents(db()),
  ]);
  const runs = rows.slice(0, PAGE);
  const totals = runs.reduce((t, { run }) => ({ cost: t.cost + run.costUsd, matched: t.matched + run.matched }), { cost: 0, matched: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Runs</h1>
        <form method="get" className="flex items-center gap-2">
          <select name="agent" defaultValue={agentId ?? ""} className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm">
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button className="h-8 rounded-md border border-zinc-300 px-3 text-sm hover:bg-zinc-50">Filter</button>
        </form>
        <span className="ml-auto text-xs text-zinc-500">
          This page: {totals.matched} matches · ${totals.cost.toFixed(3)} spent
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Trigger</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-right font-medium" title="Fetched / new / passed hard filter / scored / matched">
                Fetched → New → Filtered → Scored → Matched
              </th>
              <th className="px-3 py-2 text-right font-medium">Tokens in / out</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 align-top">
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-zinc-500">
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map(({ run, agentName }) => (
              <tr key={run.id}>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{dateTime(run.startedAt ?? run.queuedAt)}</td>
                <td className="px-3 py-2">
                  <Link href={`/agents/${run.agentId}`} className="hover:underline">
                    {agentName}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  {run.trigger}
                  {run.requestedBy && <div className="text-xs text-zinc-400">{run.requestedBy}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                  {duration(run.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs tabular-nums">
                  {run.fetched} → {run.newJobs} → {run.filtered} → {run.scored} → <span className="font-semibold">{run.matched}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                  {run.inputTokens.toLocaleString()} / {run.outputTokens.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">${run.costUsd.toFixed(4)}</td>
                <td className="max-w-md px-3 py-2">
                  {run.errors.length === 0 ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-xs text-red-700">
                        {run.errors.length} error{run.errors.length > 1 ? "s" : ""}
                      </summary>
                      <ul className="mt-1 space-y-1 text-xs text-zinc-700">
                        {run.errors.map((e, i) => (
                          <li key={i} className="break-words">
                            <span className="font-mono text-zinc-500">
                              [{e.stage}
                              {e.source ? `/${e.source}` : ""}]
                            </span>{" "}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(page > 1 || rows.length > PAGE) && (
          <div className="flex justify-end gap-2 border-t border-zinc-100 px-3 py-2 text-xs">
            {page > 1 && <Link className="rounded border px-2 py-1 hover:bg-zinc-50" href={withParams(params, { page: page - 1 })}>Newer</Link>}
            {rows.length > PAGE && <Link className="rounded border px-2 py-1 hover:bg-zinc-50" href={withParams(params, { page: page + 1 })}>Older</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
