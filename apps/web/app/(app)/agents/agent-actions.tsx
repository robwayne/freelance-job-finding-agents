import Link from "next/link";
import { runNowAction, toggleAgentAction } from "../actions";

const btn = "rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40";

interface Props {
  agentId: string;
  enabled: boolean;
  busy: boolean;
  /** False when the agent is paused and settings disallow manual runs of paused agents. */
  canRun: boolean;
  showEdit?: boolean;
}

export function AgentActions({ agentId, enabled, busy, canRun, showEdit = true }: Props) {
  return (
    <div className="flex justify-end gap-1.5">
      <form action={runNowAction}>
        <input type="hidden" name="agentId" value={agentId} />
        <button
          className={btn}
          disabled={busy || !canRun}
          title={busy ? "A run is already queued or running" : canRun ? "Queue a run now" : "Paused (manual runs of paused agents are off in Settings)"}
        >
          {busy ? "Running…" : "Run now"}
        </button>
      </form>
      <form action={toggleAgentAction}>
        <input type="hidden" name="agentId" value={agentId} />
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <button className={btn}>{enabled ? "Pause" : "Resume"}</button>
      </form>
      {showEdit && (
        <Link href={`/agents/${agentId}`} className={btn}>
          Edit
        </Link>
      )}
    </div>
  );
}
