"use server";

import {
  AgentUpdateSchema,
  enqueueRun,
  getAgent,
  getSettings,
  GlobalSettingsSchema,
  MATCH_STATUSES,
  rescoreMatches,
  saveSettings,
  setAgentEnabled,
  setMatchStatus,
  updateAgent,
} from "@jf/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export interface ActionState {
  ok: boolean;
  message?: string;
  at?: number;
}

const zodMessage = (err: z.ZodError) =>
  err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
    .join("; ");

export async function setStatusAction(form: FormData) {
  const email = await requireUser();
  const input = z
    .object({ jobId: z.string().uuid(), agentId: z.string().uuid(), status: z.enum(MATCH_STATUSES) })
    .parse(Object.fromEntries(form));
  await setMatchStatus(db(), { ...input, changedBy: email });
  revalidatePath("/jobs");
}

export async function runNowAction(form: FormData) {
  const email = await requireUser();
  const agentId = z.string().uuid().parse(form.get("agentId"));
  const settings = await getSettings(db());
  const agent = await getAgent(db(), agentId);
  if (!agent || (!agent.enabled && !settings.runs.allowManualRunWhenPaused)) return;
  // No-op if a run is already queued or running; the worker picks it up on its next tick.
  await enqueueRun(db(), agentId, "manual", email);
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/runs");
}

export async function toggleAgentAction(form: FormData) {
  await requireUser();
  const agentId = z.string().uuid().parse(form.get("agentId"));
  const enabled = form.get("enabled") === "true";
  await setAgentEnabled(db(), agentId, enabled);
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}

/** Save an agent's config. New weights or threshold rescore that agent's matches immediately. */
export async function saveAgentAction(agentId: string, input: unknown): Promise<ActionState> {
  await requireUser();
  const parsed = AgentUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: zodMessage(parsed.error) };
  const row = await updateAgent(db(), z.string().uuid().parse(agentId), parsed.data);
  if (!row) return { ok: false, message: "Agent not found" };
  const settings = await getSettings(db());
  const n = await rescoreMatches(db(), { agentId, anchors: settings.priority });
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/jobs");
  return { ok: true, message: `Saved. Rescored ${n} match${n === 1 ? "" : "es"}.`, at: Date.now() };
}

/** Save global settings. The worker reads them at the start of every run; priority scales rescore now. */
export async function saveSettingsAction(input: unknown): Promise<ActionState> {
  const email = await requireUser();
  const parsed = GlobalSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: zodMessage(parsed.error) };
  const before = await getSettings(db());
  await saveSettings(db(), parsed.data, email);
  let note = "";
  if (JSON.stringify(before.priority) !== JSON.stringify(parsed.data.priority)) {
    const n = await rescoreMatches(db(), { anchors: parsed.data.priority });
    note = ` Rescored ${n} match${n === 1 ? "" : "es"}.`;
  }
  revalidatePath("/settings");
  revalidatePath("/jobs");
  return { ok: true, message: `Saved. The next run uses these settings.${note}`, at: Date.now() };
}
