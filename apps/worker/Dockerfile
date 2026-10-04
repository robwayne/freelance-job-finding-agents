# Build from the repo root:  docker build -f apps/worker/Dockerfile -t job-finder-worker .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @jf/worker... --filter @jf/db
RUN pnpm --filter @jf/worker build
# Production node_modules for the worker only (workspace packages are bundled into dist).
RUN pnpm deploy --filter @jf/worker --prod --legacy /out

FROM base AS runtime
ENV NODE_ENV=production FIXTURES_DIR=/app/fixtures MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/worker/dist ./dist
COPY --from=build /repo/packages/db/migrations ./migrations
COPY fixtures ./fixtures
USER node
# Long-running loop. One-off commands: `docker run ... node dist/cli/once.js --dry-run`
CMD ["node", "dist/index.js"]
