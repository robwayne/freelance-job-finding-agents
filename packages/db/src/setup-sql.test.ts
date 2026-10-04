import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("supabase/setup.sql", () => {
  it("contains every migration (run `pnpm db:sql` after adding one)", () => {
    const setup = read("../../../supabase/setup.sql");
    const journal = JSON.parse(read("../migrations/meta/_journal.json")) as { entries: { tag: string; when: number }[] };
    for (const e of journal.entries) {
      const hash = createHash("sha256").update(read(`../migrations/${e.tag}.sql`)).digest("hex");
      expect(setup, `${e.tag} is missing or outdated in setup.sql`).toContain(`VALUES ('${hash}', ${e.when})`);
    }
  });
});
