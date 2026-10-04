/** pnpm rescore: recompute priority for every scored match using current weights and settings. */
import { createDb, getSettings, rescoreMatches } from "@jf/db";
import { requireDbUrl } from "../lib/env";

const { db, close } = createDb(requireDbUrl(), { mode: "session" });
try {
  const settings = await getSettings(db);
  const n = await rescoreMatches(db, { anchors: settings.priority });
  console.log(`Rescored ${n} matches.`);
} finally {
  await close();
}
