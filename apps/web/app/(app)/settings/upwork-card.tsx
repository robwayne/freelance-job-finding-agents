import { getIntegrationToken } from "@jf/db";
import { Badge, Card } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { UPWORK_PROVIDER, upworkConfigured, upworkRedirectUri } from "@/lib/upwork";

const RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Upwork connected. The worker uses it from its next run." },
  denied: { ok: false, text: "Access was not approved on Upwork." },
  state_mismatch: { ok: false, text: "The sign-in expired or was opened in another browser. Try Connect again." },
  missing_code: { ok: false, text: "Upwork didn't return an authorization code. Try again." },
  exchange_failed: {
    ok: false,
    text: "Upwork rejected the token exchange. Check the client ID/secret in Vercel and that the callback URL below is registered exactly.",
  },
};

export async function UpworkCard({ result }: { result?: string }) {
  const configured = upworkConfigured();
  const token = await getIntegrationToken(db(), UPWORK_PROVIDER);
  const callback = await upworkRedirectUri();
  const notice = result ? RESULTS[result] : undefined;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Upwork connection
          <Badge tone={token?.refreshToken || token?.accessToken ? "green" : "zinc"}>
            {token?.refreshToken || token?.accessToken ? "connected" : "not connected"}
          </Badge>
        </span>
      }
    >
      {notice && (
        <p className={`mb-3 rounded-md px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{notice.text}</p>
      )}
      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-600">Callback URL to register on your Upwork API key</div>
          <div className="flex items-center gap-2">
            <code className="break-all rounded bg-zinc-100 px-2 py-1 text-xs">{callback}</code>
            <CopyButton text={callback} />
          </div>
        </div>
        {token && (
          <p className="text-xs text-zinc-500">
            Last authorized or refreshed {dateTime(token.updatedAt)}
            {token.expiresAt ? `; access token expires ${dateTime(token.expiresAt)} (refreshed automatically)` : ""}.
          </p>
        )}
        {configured ? (
          <a href="/upwork/connect" className="inline-block rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            {token ? "Reconnect Upwork" : "Connect Upwork"}
          </a>
        ) : (
          <p className="text-zinc-700">
            Add <code>UPWORK_CLIENT_ID</code> and <code>UPWORK_CLIENT_SECRET</code> in Vercel (Settings &gt; Environment Variables),
            redeploy, then come back here to connect.
          </p>
        )}
      </div>
    </Card>
  );
}
