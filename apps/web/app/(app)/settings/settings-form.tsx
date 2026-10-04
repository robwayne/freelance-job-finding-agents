"use client";

import { DEFAULT_ANCHORS, type PriorityAnchors } from "@jf/scoring";
import type { GlobalSettings } from "@jf/db";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { Field, inputCls, NumberInput, SaveBar, Toggle } from "@/components/form";
import { saveSettingsAction, type ActionState } from "../actions";

interface Info {
  allowlist: string[];
  upworkConfigured: boolean;
}

export function SettingsForm({ settings, info }: { settings: GlobalSettings; info: Info }) {
  const [draft, setDraft] = useState(settings);
  const [queries, setQueries] = useState(settings.sources.upworkSearchQueries.join("\n"));
  const [saved, setSaved] = useState(JSON.stringify(settings));
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  const payload: GlobalSettings = {
    ...draft,
    sources: {
      ...draft.sources,
      upworkSearchQueries: queries
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean),
    },
  };
  const dirty = JSON.stringify(payload) !== saved;

  const setSection = <S extends keyof GlobalSettings, K extends keyof GlobalSettings[S]>(s: S, k: K, v: GlobalSettings[S][K]) =>
    setDraft((d) => ({ ...d, [s]: { ...d[s], [k]: v } }));
  const anchor = (k: keyof PriorityAnchors) => (n: number) => setSection("priority", k, n);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await saveSettingsAction(payload);
          setResult(res);
          if (res.ok) {
            setDraft(payload);
            setSaved(JSON.stringify(payload));
          }
        });
      }}
    >
      <Card title="Scoring model">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Model" hint="Anthropic model ID">
            <input className={`${inputCls} font-mono text-xs`} value={draft.scoring.model} onChange={(e) => setSection("scoring", "model", e.target.value)} />
          </Field>
          <Field label="Parallel scoring calls">
            <NumberInput value={draft.scoring.maxConcurrency} min={1} max={16} step={1} onChange={(n) => setSection("scoring", "maxConcurrency", n)} />
          </Field>
          <Field label="Max jobs scored per run" hint="Freshest first; the rest wait for the next run">
            <NumberInput value={draft.scoring.maxJobsPerRun} min={1} step={1} onChange={(n) => setSection("scoring", "maxJobsPerRun", n)} />
          </Field>
          <Field label="Max output tokens">
            <NumberInput value={draft.scoring.maxOutputTokens} min={256} step={1} onChange={(n) => setSection("scoring", "maxOutputTokens", n)} />
          </Field>
          <Field label="Input $ per million tokens" hint="For run cost tracking">
            <NumberInput value={draft.scoring.inputCostPerMTok} min={0} step={0.01} onChange={(n) => setSection("scoring", "inputCostPerMTok", n)} />
          </Field>
          <Field label="Output $ per million tokens">
            <NumberInput value={draft.scoring.outputCostPerMTok} min={0} step={0.01} onChange={(n) => setSection("scoring", "outputCostPerMTok", n)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Agency profile (prepended to every scoring prompt)">
            <textarea
              className={`${inputCls} h-24 py-1.5`}
              value={draft.scoring.agencyProfile}
              onChange={(e) => setSection("scoring", "agencyProfile", e.target.value)}
            />
          </Field>
          <Field label="Extra scoring guidance (optional)" hint="e.g. 'Prefer US and EU clients. Treat Shopify work as a plus.'">
            <textarea
              className={`${inputCls} h-20 py-1.5`}
              value={draft.scoring.extraInstructions}
              onChange={(e) => setSection("scoring", "extraInstructions", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Priority scales"
        actions={
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, priority: DEFAULT_ANCHORS }))}
            className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100"
          >
            Reset to defaults
          </button>
        }
      >
        <p className="mb-3 text-xs text-zinc-500">
          How raw values map to 0-1 before each agent&apos;s weights apply. Saving changes here rescores every match.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Rate: worth nothing at ($/hr)">
            <NumberInput value={draft.priority.rateFloor} min={0} onChange={anchor("rateFloor")} />
          </Field>
          <Field label="Rate: full marks at ($/hr)">
            <NumberInput value={draft.priority.rateTarget} min={1} onChange={anchor("rateTarget")} />
          </Field>
          <Field label="Pay: worth nothing at ($)" hint="Log scale between the two">
            <NumberInput value={draft.priority.payFloor} min={1} onChange={anchor("payFloor")} />
          </Field>
          <Field label="Pay: full marks at ($)">
            <NumberInput value={draft.priority.payTarget} min={1} onChange={anchor("payTarget")} />
          </Field>
          <Field label="Duration: full marks up to (days)">
            <NumberInput value={draft.priority.durationBestDays} min={0} onChange={anchor("durationBestDays")} />
          </Field>
          <Field label="Duration: worth nothing from (days)">
            <NumberInput value={draft.priority.durationWorstDays} min={1} onChange={anchor("durationWorstDays")} />
          </Field>
          <Field label="Competition: worth nothing at (proposals)">
            <NumberInput value={draft.priority.competitionMaxProposals} min={1} step={1} onChange={anchor("competitionMaxProposals")} />
          </Field>
          <Field label="Freshness half-life (hours)">
            <NumberInput value={draft.priority.freshnessHalfLifeHours} min={0.5} onChange={anchor("freshnessHalfLifeHours")} />
          </Field>
          <Field label="Value used when unknown (0-1)" hint="e.g. HN posts have no proposal count">
            <NumberInput value={draft.priority.unknownNeutral} min={0} max={1} step={0.01} onChange={anchor("unknownNeutral")} />
          </Field>
        </div>
      </Card>

      <Card title="Runs">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Refresh priority of recent matches every (min)" hint="Freshness decays over time. 0 turns this off.">
            <NumberInput value={draft.runs.freshnessRescoreMinutes} min={0} step={1} onChange={(n) => setSection("runs", "freshnessRescoreMinutes", n)} />
          </Field>
          <Field label="Mark a run failed after no heartbeat for (min)">
            <NumberInput value={draft.runs.staleRunMinutes} min={2} step={1} onChange={(n) => setSection("runs", "staleRunMinutes", n)} />
          </Field>
          <div className="flex items-end pb-1.5 sm:col-span-2">
            <Toggle
              checked={draft.runs.allowManualRunWhenPaused}
              onChange={(v) => setSection("runs", "allowManualRunWhenPaused", v)}
              label='Allow "Run now" on paused agents'
            />
          </div>
        </div>
      </Card>

      <Card title="Sources">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Upwork mode"
            hint={info.upworkConfigured ? "Upwork credentials are configured on the server." : "No Upwork credentials on this server: auto uses fixtures."}
          >
            <select
              className={inputCls}
              value={draft.sources.upworkMode}
              onChange={(e) => setSection("sources", "upworkMode", e.target.value as GlobalSettings["sources"]["upworkMode"])}
            >
              <option value="auto">Auto (live API if credentials exist, otherwise fixtures)</option>
              <option value="live">Live API</option>
              <option value="fixture">Fixtures (sample data)</option>
            </select>
          </Field>
          <div className="flex items-end pb-1.5">
            <Toggle
              checked={draft.sources.hnEnabled}
              onChange={(v) => setSection("sources", "hnEnabled", v)}
              label="Hacker News freelancer threads enabled"
            />
          </div>
          <div className="sm:col-span-2">
            <Field label="Upwork search queries (one per line; results are merged)">
              <textarea className={`${inputCls} h-32 py-1.5 font-mono text-xs`} value={queries} onChange={(e) => setQueries(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Access">
        <p className="text-sm text-zinc-700">Allowed emails: {info.allowlist.join(", ") || "none"}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Set by <code>ALLOWED_EMAILS</code> on the server, not editable here, so a bad save can&apos;t lock you out or let anyone in.
          Secrets (API keys, database URLs) also live only in the server environment.
        </p>
      </Card>

      <SaveBar pending={pending} dirty={dirty} message={result?.message} ok={result?.ok} />
    </form>
  );
}
