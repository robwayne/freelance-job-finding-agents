"use client";

export const inputCls =
  "h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm focus:border-zinc-900 focus:outline-none disabled:bg-zinc-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-zinc-400">{hint}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number | "any";
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      className={inputCls}
      value={Number.isFinite(value) ? value : ""}
      step={step ?? "any"}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SaveBar({ pending, message, ok, dirty }: { pending: boolean; message?: string; ok?: boolean; dirty: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
      <button
        type="submit"
        disabled={pending || !dirty}
        className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      {dirty && !pending && <span className="text-xs text-amber-700">Unsaved changes</span>}
      {message && !dirty && <span className={`text-sm ${ok ? "text-emerald-700" : "text-red-600"}`}>{message}</span>}
      {message && dirty && !ok && <span className="text-sm text-red-600">{message}</span>}
    </div>
  );
}
