# Deployment Guide

This document describes how to deploy onService to production. The platform has
three deployable artefacts: the API (Node + Express), the admin web app
(React + Vite), and the mobile app (Expo / React Native). All three share a
single PostgreSQL database, a Redis instance, and an S3-compatible object
store.

## Pre-flight (every release)

Before promoting any artefact to production:

- All packages typecheck cleanly: `cd packages/api && npx tsc --noEmit`,
  `cd apps/admin && npx tsc --noEmit`.
- Lint is clean: `npx eslint .` from each package.
- The full Jest suite is green: `cd packages/api && npx jest --silent`.
- The smoke gate is green:
  `cd packages/api && npx jest __tests__/smoke.test.ts`. **The smoke gate is
  mandatory — every deploy must pass it before going live.** If any smoke
  test fails the deploy must be blocked and the on-call lead engineer paged.
- The k6 load test (`load-tests/full-suite.js`) has been run against staging
  within the last 7 days with no regressions in p95 latency.

## API deploy (Render)

Render is the chosen host because its free Postgres + Redis add-ons match our
staging needs and its native Node runtime requires no Dockerfile maintenance.

- **Service type**: Web Service, runtime Node 20+.
- **Root directory**: `packages/api`.
- **Build command**: `npm ci && npm run build`.
- **Start command**: `node dist/server.js`.
- **Health check path**: `/health` (returns `{ status: "ok" }`).
- **Auto-deploy branch**: `main`. Every push to `main` triggers a build.
- **Database**: Provision a Render Postgres 18 instance and copy the
  `Internal Database URL` to `DATABASE_URL`. Use the same value for
  `DATABASE_DIRECT_URL` until PgBouncer is added.
- **Redis**: Provision Render Redis (or Upstash) and copy the URL to
  `REDIS_URL`.
- **S3**: Use AWS S3 or DigitalOcean Spaces. Set `S3_BUCKET`, `S3_REGION`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optionally `S3_ENDPOINT`
  (for Spaces) and `S3_CDN_URL`.
- **Run migrations on deploy**: add a `Pre-Deploy Command` of
  `bash scripts/run-migrations.sh`. The script is idempotent — it skips
  already-applied migrations.
- **Required env vars** (see "Environment variable inventory" below).

## Admin deploy (Vercel)

The admin web app is a Vite SPA that talks to the API over CORS.

- **Root directory**: `apps/admin`.
- **Build command**: `npm run build`.
- **Output directory**: `dist`.
- **Install command**: `npm ci --legacy-peer-deps` (matches the local
  install pattern).
- **Framework preset**: `Other` (Vite is auto-detected; no preset needed).
- **Required env vars**:
  - `VITE_API_URL` — full URL of the deployed API
    (e.g. `https://api.onservice.ph`).
  - `VITE_SENTRY_DSN` — Sentry browser DSN (optional in dev; required in
    production).
- **SPA rewrites**: add a Vercel rewrite of `/(.*)` → `/index.html` so deep
  links work. Vite's history-mode router needs this.
- **Auto-deploy branch**: `main`.

## Mobile deploy (EAS Build + EAS Submit)

The mobile app uses Expo's managed workflow. EAS configuration lives in
`apps/mobile/eas.json`.

- **Build**: `eas build --platform all` from `apps/mobile`. Produces an `.ipa`
  and an `.aab`.
- **Submit**: `eas submit --platform ios` and
  `eas submit --platform android`. These push to App Store Connect and
  Google Play Console respectively.
- **OTA updates**: `eas update --branch production` for JS-only fixes that
  don't require a native rebuild. Use sparingly — App Review terms apply to
  significant changes.
- **Sentry release tagging**: the build pipeline writes the commit SHA to
  `Constants.expoConfig.extra.release`; Sentry picks it up automatically via
  `release: ...` in `_layout.tsx`.
- **Versioning**: bump `expo.version` (user-facing) and `expo.ios.buildNumber`
  / `expo.android.versionCode` (store-internal) in `app.config.ts` for every
  store submission. EAS will refuse a submit with a stale build number.

## Database migrations

Migrations live in `packages/api/migrations/` as numbered SQL files
(`001_*.sql`, `002_*.sql`, …). Apply with:

```bash
bash scripts/run-migrations.sh
```

The runner reads `DATABASE_URL`, tracks applied migrations in a
`schema_migrations` table, and is idempotent. **There is no down-migration
system.** To roll back a migration:

1. `git revert <commit-sha-of-migration>` to remove the SQL file from the
   tree.
2. Hand-write the inverse SQL (e.g. `DROP COLUMN`, `DROP TABLE`,
   `ALTER TYPE … DROP VALUE`) and apply it via `psql $DATABASE_URL`.
3. Manually delete the corresponding row from `schema_migrations` so the
   runner does not think it is still applied.
4. Redeploy the API at the reverted commit.

Treat migrations as forward-only. Destructive changes (column drops, type
narrowing) require a multi-deploy strategy: ship a backwards-compatible
migration first, then a follow-up that drops the old shape after every
running instance has caught up.

## Environment variable inventory

The full list lives in `.env.example`. Required at minimum for production:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | API listen port (default 7381) |
| `APP_URL` / `ADMIN_URL` / `API_URL` | Canonical public URLs |
| `DATABASE_URL` / `DATABASE_DIRECT_URL` | Postgres connection strings |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Direct DB params used by some scripts |
| `DB_POOL_MIN` / `DB_POOL_MAX` | Connection pool bounds |
| `PGBOUNCER_HOST` / `PGBOUNCER_PORT` | Optional pooler |
| `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Cache + queues |
| `JWT_SECRET` | HS256 signing secret (rotate with care — invalidates all sessions) |
| `JWT_ACCESS_EXPIRES_IN` | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Default `30d` |
| `JWT_ADMIN_REFRESH_EXPIRES_IN` | Default `1h` |
| `PAYMONGO_PUBLIC_KEY` / `PAYMONGO_SECRET_KEY` / `PAYMONGO_WEBHOOK_SECRET` | Payment gateway |
| `SEMAPHORE_API_KEY` / `SEMAPHORE_SENDER_NAME` | SMS gateway |
| `FCM_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS` | Push notifications |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_ENDPOINT` | Object storage |
| `CAPTCHA_SECRET_KEY` / `CAPTCHA_SITE_KEY` | CAPTCHA after N failed OTPs |
| `OTP_LENGTH` / `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_COOLDOWN_SECONDS` / `OTP_MAX_REQUESTS_PER_HOUR` | OTP tuning |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_AUTH_MAX_REQUESTS` | API rate limiting |
| `SENTRY_DSN` | API error reporting |
| `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` | Metrics dashboard |
| `DOMAIN` / `CERTBOT_EMAIL` | TLS provisioning (self-hosted only) |

Admin SPA additionally needs `VITE_API_URL` and `VITE_SENTRY_DSN`. Mobile
reads `expo.extra.sentryDsn` from `app.config.ts`.

## Rollback procedure

For a bad release:

1. `git revert HEAD` on `main` (or `git revert <sha>` for a specific commit).
2. `git push origin main`.
3. Render auto-deploys the revert; Vercel auto-deploys the admin revert.
4. For mobile: revert the offending commit, bump the build number, and run
   `eas build` + `eas submit` again. For pure JS bugs, use
   `eas update --branch production` with the reverted JS bundle.
5. If the revert touched a migration, follow the manual SQL inverse procedure
   in "Database migrations" above.
6. Notify the on-call channel that a rollback was issued and capture the
   reason in the post-mortem doc.

Never `git push --force` to `main`. Never amend a published commit. If
the revert fails to fix the issue, page the lead engineer rather than
attempting further hot-fixes under pressure.

## On-call escalation

| Severity | Definition | Action |
| --- | --- | --- |
| **P1** | Customer-facing outage, payment failures, data loss, security incident | Page DPO + lead engineer immediately via PagerDuty. Acknowledge within 15 min. Status page updated within 30 min. |
| **P2** | Degraded performance, single-feature outage, elevated error rate | Slack `#oncall` channel. Triage by next business day. |
| **P3** | Cosmetic, minor bugs, log noise | File a ticket; no paging. |

Escalation contacts (placeholders — fill in for production):

- **PagerDuty service**: `onservice-prod-api`
- **Slack channel**: `#onservice-oncall`
- **DPO email**: `dpo@onservice.ph`
- **Lead engineer phone**: see PagerDuty escalation policy

## Smoke gate (mandatory)

Before flipping traffic to a new revision:

```bash
cd packages/api
npx jest __tests__/smoke.test.ts
```

The smoke suite covers the invariants whose breakage indicates an unsafe
deploy: health endpoint, auth validators, money conservation, booking state
machine, commission math, TOTP correctness, audit-CSV escaping, admin route
guarding, and JWT expiry config. **Treat any smoke failure as a blocker.**
