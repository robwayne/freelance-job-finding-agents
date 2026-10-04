"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
