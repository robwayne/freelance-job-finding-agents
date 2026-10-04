import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Local dev keeps one .env at the repo root (shared with the worker). On Vercel there is no
// file and variables come from the project settings.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@jf/db", "@jf/scoring"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  // Keep `next dev` from writing extra markdown files into this directory.
  agentRules: false,
};

export default nextConfig;
