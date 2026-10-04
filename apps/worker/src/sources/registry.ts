import type { Database, GlobalSettings } from "@jf/db";
import { createHnSource } from "./hn";
import type { Source } from "./types";
import { createUpworkSource, fixturesPath } from "./upwork";

/** Every available source, configured from the latest global settings. Agents pick from these. */
export function buildSources(settings: GlobalSettings, db: Database | null): Source[] {
  const sources: Source[] = [
    createUpworkSource({
      mode: settings.sources.upworkMode,
      searchQueries: settings.sources.upworkSearchQueries,
      fixturesDir: fixturesPath("upwork"),
      db,
    }),
  ];
  if (settings.sources.hnEnabled) sources.push(createHnSource());
  return sources;
}
