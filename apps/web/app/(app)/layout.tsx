import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signOut } from "../login/actions";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const email = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-6 px-4">
          <Link href="/jobs" className="text-sm font-semibold">
            Job Finder
          </Link>
          <nav className="flex gap-1 text-sm">
            <NavLink href="/jobs">Jobs</NavLink>
            <NavLink href="/agents">Agents</NavLink>
            <NavLink href="/runs">Runs</NavLink>
            <NavLink href="/settings">Settings</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
            <span>{email}</span>
            <form action={signOut}>
              <button className="rounded px-2 py-1 hover:bg-zinc-100 hover:text-zinc-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
