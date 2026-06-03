FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache curl

FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY tsconfig.json ./

RUN npm ci --workspace=packages/api --include-workspace-root --ignore-scripts --legacy-peer-deps

FROM deps AS build

COPY packages/api/ packages/api/

RUN npm run build --workspace=packages/api

FROM base AS production

ENV NODE_ENV=production
WORKDIR /app

# Phase 200 — run the API via tsx (the same runtime the dev server uses),
# not the compiled dist. The project's tsconfig targets a bundler
# (module: ESNext, moduleResolution: bundler), so `tsc` emits ES-module
# imports WITHOUT file extensions; `node dist/server.js` then crashes with
# ERR_MODULE_NOT_FOUND. tsx executes the TypeScript source directly and
# resolves those imports correctly. node_modules already includes tsx
# (installed by the deps stage), so this needs no extra dependency.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/api/src ./packages/api/src
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY --from=build /app/packages/api/tsconfig.json ./packages/api/
COPY tsconfig.json ./
COPY packages/api/migrations ./packages/api/migrations

WORKDIR /app/packages/api

EXPOSE 7381

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:7381/health/ready || exit 1

CMD ["npx", "tsx", "src/server.ts"]
