# Phase 12 — Checks Index

| Check | Result |
|---|---|
| Pre-flight: baseline-commit.txt | OK |
| Pre-flight: typecheck-before.log | OK |
| Pre-flight: lint-before.log | OK |
| `packages/api` `npx tsc --noEmit` | exit 0 |
| `packages/api` `npx eslint . --quiet` | exit 0 |
| `packages/api` `npx jest` (full) | 802 / 802 pass (+13 smoke tests) |
| `apps/admin` `npx tsc --noEmit` | exit 0 |
| `apps/admin` `npx vite build` | exit 0 (main entry +30 kB gzip Sentry) |
| Repo-root `npm run lint` | exit 0 |

## Files at a glance
- 1 NEW backend smoke test (`smoke.test.ts`, 13 tests)
- 2 NEW docs (`DEPLOYMENT.md`, `SECURITY-POSTURE.md`)
- 1 NEW admin dep (`@sentry/react@8.40.0`)
- 4 admin file touches (main.tsx, App.tsx, vite-env.d.ts, LoginPage.tsx)
- 1 backend route file additive edit (`auth.routes.ts`: middleware + force-enrolment branch + token mint on /enable)
- 0 new migrations (force-enrolment is hardcoded for admin roles)
