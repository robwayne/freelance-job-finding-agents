"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      className={`rounded px-2.5 py-1 ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
    >
      {children}
    </Link>
  );
}
