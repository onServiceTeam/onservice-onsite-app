# Phase 09 — Checks Index

| Check | Result |
|---|---|
| Pre-flight: baseline-commit.txt written | ✓ |
| Pre-flight: typecheck-before.log written | ✓ |
| Pre-flight: lint-before.log written | ✓ |
| `packages/api` `npx tsc --noEmit` | exit 0 |
| `packages/api` `npx eslint <new files>` | exit 0 |
| `packages/api` `npx jest` (full) | 735 / 735 pass |
| `apps/admin` `npx tsc --noEmit` | exit 0 |
| `apps/admin` `npm run build` | exit 0 (MarketingPage chunk 21.13 kB) |
| `apps/mobile` `npx tsc --noEmit` | exit 0 |
| Repo-root `npm run lint` | exit 0 |

## Files at a glance
- 8 NEW mobile screens
- 1 NEW admin page (`MarketingPage.tsx`)
- 1 NEW backend service (`marketing-admin.service.ts`)
- 1 NEW backend routes (`marketing-admin.routes.ts`)
- 1 NEW migration (`056_marketing_promos_campaigns.sql`)
- 1 NEW jest suite (`marketing-admin.test.ts`, 33 tests)
- 2 sacred-file touches (server.ts +5, App.tsx +2)
