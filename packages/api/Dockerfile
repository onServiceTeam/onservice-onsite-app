FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache curl

FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY tsconfig.json ./

RUN npm ci --workspace=packages/api --include-workspace-root --ignore-scripts

FROM deps AS build

COPY packages/api/ packages/api/

RUN npm run build --workspace=packages/api

FROM base AS production

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY packages/api/migrations ./packages/api/migrations

WORKDIR /app/packages/api

EXPOSE 7381

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:7381/health/ready || exit 1

CMD ["node", "dist/server.js"]
