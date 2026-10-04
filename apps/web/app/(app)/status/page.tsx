import { requireUser } from "@/lib/auth";
import { runHealthChecks } from "@/lib/health";

export const metadata = { title: "Status" };

/** Setup diagnostics. Never throws, so it renders even when the database is unreachable. */
export default async function StatusPage() {
  await requireUser();
  const checks = await runHealthChecks();
  const allOk = checks.every((c) => c.ok);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">Status</h1>
      <p className={`rounded-md px-3 py-2 text-sm ${allOk ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
        {allOk ? "Everything is set up." : "Setup problem found. Fix the first failing check, redeploy if you changed Vercel settings, then reload this page."}
      </p>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {checks.map((c) => (
          <li key={c.name} className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
              {c.name}
            </div>
            <div className="mt-1 break-words font-mono text-xs text-zinc-600">{c.detail}</div>
            {c.hint && <div className="mt-1 text-sm text-zinc-800">{c.hint}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
