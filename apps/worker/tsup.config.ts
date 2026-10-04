import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli/once.ts", "src/cli/rescore.ts", "src/cli/upwork-auth.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  // Bundle workspace packages (they ship TypeScript source). npm deps, including the ones
  // @jf/db uses, are listed in this package.json so they stay external and get installed.
  noExternal: [/^@jf\//],
});
