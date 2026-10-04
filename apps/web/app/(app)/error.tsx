"use client";

import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-red-200 bg-white p-5">
      <h1 className="text-base font-semibold">This page couldn&apos;t load</h1>
      <p className="text-sm text-zinc-700">
        This is usually a setup problem, such as the database connection or missing tables. The status page checks each piece and says
        what to fix.
      </p>
      <div className="flex gap-2">
        <Link href="/status" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
          Open status page
        </Link>
        <button onClick={reset} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
          Try again
        </button>
      </div>
      {error.digest && <p className="font-mono text-xs text-zinc-400">Error {error.digest}</p>}
    </div>
  );
}
