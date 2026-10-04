import { getSettings, listAgentSummaries } from "@jf/db";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { age, dateTime } from "@/lib/format";
import { Badge, RunStatusBadge } from "@/components/ui";
import { AgentActions } from "./agent-actions";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  await requireUser();
  const now = new Date();
  const [agents, settings] = await Promise.all([listAgentSummaries(db(), now), getSettings(db())]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Agents</h1>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Schedule</th>
              <th className="px-3 py-2 font-medium">Last run</th>
              <th className="px-3 py-2 font-medium">Next run</th>
              <th className="px-3 py-2 text-right font-medium">Matches</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {agents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-zinc-500">
                  No agents yet. Run <code>pnpm db:seed</code> to create the default agent.
                </td>
              </tr>
            )}
            {agents.map(({ agent, lastRun, activeRun, nextRunAt, matchCount, newMatchCount }) => (
              <tr key={agent.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2">
                  <Link href={`/agents/${agent.id}`} className="font-medium hover:underline">
                    {agent.name}
                  </Link>
                  <div className="text-xs text-zinc-500">{agent.sources.join(", ")}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={agent.enabled ? "green" : "zinc"}>{agent.enabled ? "enabled" : "paused"}</Badge>
                  {activeRun && (
                    <span className="ml-1.5">
                      <RunStatusBadge status={activeRun.status} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-600">every {agent.scheduleIntervalMinutes} min</td>
                <td className="px-3 py-2">
                  {lastRun ? (
                    <Link href={`/runs?agent=${agent.id}`} className="flex items-center gap-2 hover:underline">
                      <RunStatusBadge status={lastRun.status} />
                      <span className="text-zinc-600">{age(lastRun.finishedAt ?? lastRun.queuedAt, now)} ago</span>
                    </Link>
                  ) : (
                    <span className="text-zinc-400">never</span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  {!agent.enabled ? "paused" : activeRun ? "in progress" : nextRunAt && nextRunAt <= now ? "due now" : dateTime(nextRunAt)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Link href={`/jobs?agent=${agent.id}`} className="hover:underline">
                    {matchCount}
                  </Link>
                  {newMatchCount > 0 && <span className="ml-1 text-xs text-sky-700">({newMatchCount} new)</span>}
                </td>
                <td className="px-3 py-2">
                  <AgentActions
                    agentId={agent.id}
                    enabled={agent.enabled}
                    busy={!!activeRun}
                    canRun={agent.enabled || settings.runs.allowManualRunWhenPaused}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        The worker checks every ~15 seconds for due agents and runs queued from here. &ldquo;Run now&rdquo; queues a run; it does
        nothing if one is already queued or running.
      </p>
    </div>
  );
}
