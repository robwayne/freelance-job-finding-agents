import { getSettings } from "@jf/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { parseAllowlist } from "@/lib/allowlist";
import { SettingsForm } from "./settings-form";
import { UpworkCard } from "./upwork-card";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireUser();
  const { upwork } = await searchParams;
  const { updatedAt, updatedBy, ...settings } = await getSettings(db());
  const upworkConfigured = Boolean(process.env.UPWORK_CLIENT_ID && process.env.UPWORK_CLIENT_SECRET);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold">Settings</h1>
        <span className="text-xs text-zinc-500">
          Global settings for every agent. The worker reads the latest saved version at the start of each run.
          {updatedAt && ` Last saved ${dateTime(updatedAt)}${updatedBy ? ` by ${updatedBy}` : ""}.`}
        </span>
      </div>
      <UpworkCard result={typeof upwork === "string" ? upwork : undefined} />
      <SettingsForm
        settings={settings}
        info={{ allowlist: [...parseAllowlist(process.env.ALLOWED_EMAILS)], upworkConfigured }}
      />
    </div>
  );
}
