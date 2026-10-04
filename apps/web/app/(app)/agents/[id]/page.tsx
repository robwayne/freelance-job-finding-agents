import { getAgent, getSettings, listRuns, parseAgentConfig } from "@jf/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { age } from "@/lib/format";
import { Badge, RunStatusBadge } from "@/components/ui";
import { AgentActions } from "../agent-actions";
import { AgentForm } from "./agent-form";

export const metadata = { title: "Agent" };

export default async function AgentPage({ params }: PageProps<"/agents/[id]">) {
  await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [row, settings, runs] = await Promise.all([getAgent(db(), id), getSettings(db()), listRuns(db(), { agentId: id, limit: 8 })]);
  if (!row) notFound();
  const agent = parseAgentConfig(row);
  const active = runs.find((r) => r.run.status === "queued" || r.run.status === "running");
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/agents" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Agents
        </Link>
        <h1 className="text-lg font-semibold">{agent.name}</h1>
        <Badge tone={agent.enabled ? "green" : "zinc"}>{agent.enabled ? "enabled" : "paused"}</Badge>
        {active && <RunStatusBadge status={active.run.status} />}
        <div className="ml-auto">
          <AgentActions
            agentId={agent.id}
            enabled={agent.enabled}
            busy={!!active}
            canRun={agent.enabled || settings.runs.allowManualRunWhenPaused}
            showEdit={false}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AgentForm agent={{ ...agent, updatedAt: agent.updatedAt.toISOString() }} />
        <aside className="h-fit rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold">Recent runs</h2>
            <Link href={`/runs?agent=${agent.id}`} className="text-xs text-sky-700 hover:underline">
              All runs
            </Link>
          </div>
          <ul className="divide-y divide-zinc-100 text-sm">
            {runs.length === 0 && <li className="px-4 py-3 text-zinc-500">No runs yet.</li>}
            {runs.map(({ run }) => (
              <li key={run.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <div className="flex items-center gap-2">
                  <RunStatusBadge status={run.status} />
                  <span className="text-zinc-600">{age(run.queuedAt, now)} ago</span>
                </div>
                <span className="text-xs tabular-nums text-zinc-500">
                  {run.matched}/{run.scored} matched · ${run.costUsd.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
