/**
 * One-time Upwork OAuth2 authorization (authorization code grant).
 *
 *   pnpm --filter @jf/worker upwork:auth              # prints the URL to open
 *   pnpm --filter @jf/worker upwork:auth --code XYZ   # exchanges the code, stores tokens in the DB
 *
 * The worker then refreshes the access token automatically and stores rotated refresh tokens.
 */
import { createDb } from "@jf/db";
import { env, requireDbUrl } from "../lib/env";
import { requestToken, storeUpworkTokens, UPWORK_AUTHORIZE_URL } from "../sources/upwork/oauth";
import { parseFlags } from "./args";

const flags = parseFlags(process.argv.slice(2));
if (!env.UPWORK_CLIENT_ID || !env.UPWORK_CLIENT_SECRET || !env.UPWORK_REDIRECT_URI) {
  console.error("Set UPWORK_CLIENT_ID, UPWORK_CLIENT_SECRET and UPWORK_REDIRECT_URI in .env first.");
  process.exit(1);
}

const code = flags.get("code");
if (typeof code !== "string") {
  const url = new URL(UPWORK_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.UPWORK_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.UPWORK_REDIRECT_URI);
  console.log("1. Open this URL while logged in to Upwork and approve access:\n");
  console.log(`   ${url.toString()}\n`);
  console.log("2. Copy the `code` query parameter from the redirect and run:\n");
  console.log("   pnpm --filter @jf/worker upwork:auth --code <code>");
  process.exit(0);
}

const token = await requestToken({ grant_type: "authorization_code", code, redirect_uri: env.UPWORK_REDIRECT_URI });
const { db, close } = createDb(requireDbUrl(), { mode: "session", max: 1 });
try {
  await storeUpworkTokens(db, token);
  console.log("Upwork tokens stored. The worker will refresh them automatically.");
} finally {
  await close();
}
