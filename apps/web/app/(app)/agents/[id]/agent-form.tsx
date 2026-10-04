"use client";

import type { AgentConfig, Offer } from "@jf/db";
import { PRIORITY_COMPONENTS, type PriorityComponentKey } from "@jf/scoring";
import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { Field, inputCls, NumberInput, SaveBar, Toggle } from "@/components/form";
import { saveAgentAction, type ActionState } from "../../actions";

type AgentDraft = Omit<AgentConfig, "updatedAt"> & { updatedAt: string };

const WEIGHT_LABELS: Record<PriorityComponentKey, string> = {
  rate: "Effective rate",
  pay: "Total pay",
  complexity: "Low complexity",
  duration: "Short duration",
  fit: "Fit score",
  competition: "Low proposal count",
  freshness: "Freshness",
};

const SOURCES = [
  { id: "upwork", label: "Upwork" },
  { id: "hn", label: "Hacker News freelancer threads" },
] as const;

export function AgentForm({ agent }: { agent: AgentDraft }) {
  const [draft, setDraft] = useState(agent);
  const [keywords, setKeywords] = useState(agent.filters.excludedKeywords.join("\n"));
  const [saved, setSaved] = useState(JSON.stringify(agent));
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();

  const payload = useMemo(
    () => ({
      name: draft.name,
      enabled: draft.enabled,
      scheduleIntervalMinutes: draft.scheduleIntervalMinutes,
      sources: draft.sources,
      filters: {
        ...draft.filters,
        excludedKeywords: keywords
          .split("\n")
          .map((k) => k.trim())
          .filter(Boolean),
      },
      offers: draft.offers,
      weights: draft.weights,
      scoreThreshold: draft.scoreThreshold,
    }),
    [draft, keywords],
  );
  const dirty = JSON.stringify({ ...draft, filters: payload.filters }) !== saved;
  const totalWeight = PRIORITY_COMPONENTS.reduce((s, k) => s + (Number.isFinite(draft.weights[k]) ? draft.weights[k] : 0), 0);

  const set = <K extends keyof AgentDraft>(k: K, v: AgentDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setFilter = <K extends keyof AgentDraft["filters"]>(k: K, v: AgentDraft["filters"][K]) =>
    setDraft((d) => ({ ...d, filters: { ...d.filters, [k]: v } }));
  const setOffer = (i: number, patch: Partial<Offer>) =>
    setDraft((d) => ({ ...d, offers: d.offers.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await saveAgentAction(agent.id, payload);
          setResult(res);
          if (res.ok) {
            const next = { ...draft, filters: payload.filters };
            setDraft(next);
            setSaved(JSON.stringify(next));
          }
        });
      }}
    >
      <Card title="General">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <input className={inputCls} value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Run every (minutes)" hint="Minimum 5">
            <NumberInput value={draft.scheduleIntervalMinutes} min={5} step={1} onChange={(n) => set("scheduleIntervalMinutes", n)} />
          </Field>
          <Field label="Match threshold (fit score 0-10)" hint="Scored jobs at or above this are matches">
            <NumberInput value={draft.scoreThreshold} min={0} max={10} step={0.5} onChange={(n) => set("scoreThreshold", n)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <Toggle checked={draft.enabled} onChange={(v) => set("enabled", v)} label="Enabled (runs on schedule)" />
          {SOURCES.map((s) => (
            <Toggle
              key={s.id}
              label={s.label}
              checked={draft.sources.includes(s.id)}
              onChange={(v) => set("sources", v ? [...draft.sources, s.id] : draft.sources.filter((x) => x !== s.id))}
            />
          ))}
        </div>
      </Card>

      <Card title="Hard filters">
        <p className="mb-3 text-xs text-zinc-500">
          Jobs failing any filter are dropped before scoring. If a source doesn&apos;t provide a field, the check is skipped and the
          field is passed to scoring as unknown.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Min client spend ($)">
            <NumberInput value={draft.filters.minClientSpend} min={0} onChange={(n) => setFilter("minClientSpend", n)} />
          </Field>
          <Field label="Hire check applies from (hires)">
            <NumberInput
              value={draft.filters.hireSanity.minHires}
              min={1}
              step={1}
              onChange={(n) => setFilter("hireSanity", { ...draft.filters.hireSanity, minHires: n })}
            />
          </Field>
          <Field label="Min spend per hire ($)">
            <NumberInput
              value={draft.filters.hireSanity.minSpendPerHire}
              min={0}
              onChange={(n) => setFilter("hireSanity", { ...draft.filters.hireSanity, minSpendPerHire: n })}
            />
          </Field>
          <Field label="Proposals: fewer than">
            <NumberInput value={draft.filters.maxProposals} min={1} step={1} onChange={(n) => setFilter("maxProposals", n)} />
          </Field>
          <Field label="Min fixed budget ($)">
            <NumberInput value={draft.filters.minFixedBudget} min={0} onChange={(n) => setFilter("minFixedBudget", n)} />
          </Field>
          <Field label="Min hourly rate ($/hr)">
            <NumberInput value={draft.filters.minHourlyRate} min={0} onChange={(n) => setFilter("minHourlyRate", n)} />
          </Field>
          <Field label="Posted within (hours)">
            <NumberInput value={draft.filters.maxAgeHours} min={1} onChange={(n) => setFilter("maxAgeHours", n)} />
          </Field>
          <div className="flex items-end pb-1.5">
            <Toggle
              checked={draft.filters.requirePaymentVerified}
              onChange={(v) => setFilter("requirePaymentVerified", v)}
              label="Require payment verified"
            />
          </div>
        </div>
        <div className="mt-4">
          <Field label="Excluded keywords (one per line, matched in title and description)">
            <textarea
              className={`${inputCls} h-28 py-1.5 font-mono text-xs`}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Offers"
        actions={
          <button
            type="button"
            onClick={() => set("offers", [...draft.offers, { key: `offer_${draft.offers.length + 1}`, title: "", description: "" }])}
            className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100"
          >
            Add offer
          </button>
        }
      >
        <p className="mb-3 text-xs text-zinc-500">Each job is scored against these. The key is stored on matches and used in filters.</p>
        <div className="space-y-3">
          {draft.offers.map((o, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-[12rem_1fr_auto]">
              <Field label="Key">
                <input className={`${inputCls} font-mono text-xs`} value={o.key} onChange={(e) => setOffer(i, { key: e.target.value })} />
              </Field>
              <Field label="Title">
                <input className={inputCls} value={o.title} onChange={(e) => setOffer(i, { title: e.target.value })} />
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={draft.offers.length <= 1}
                  onClick={() => set("offers", draft.offers.filter((_, j) => j !== i))}
                  className="h-8 rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              <div className="sm:col-span-3">
                <Field label="Description (what we deliver; the model reads this)">
                  <textarea
                    className={`${inputCls} h-16 py-1.5`}
                    value={o.description}
                    onChange={(e) => setOffer(i, { description: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Priority weights">
        <p className="mb-3 text-xs text-zinc-500">
          Relative importance of each component in the 0-100 priority. Saving rescores this agent&apos;s matches. The scales each
          component uses (e.g. what counts as a great rate) are global, on the Settings page.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {PRIORITY_COMPONENTS.map((k) => (
            <Field
              key={k}
              label={WEIGHT_LABELS[k]}
              hint={totalWeight > 0 && Number.isFinite(draft.weights[k]) ? `${Math.round((100 * draft.weights[k]) / totalWeight)}% of priority` : undefined}
            >
              <NumberInput value={draft.weights[k]} min={0} step={1} onChange={(n) => set("weights", { ...draft.weights, [k]: n })} />
            </Field>
          ))}
        </div>
      </Card>

      <SaveBar pending={pending} dirty={dirty} message={result?.message} ok={result?.ok} />
    </form>
  );
}
