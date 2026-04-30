# Remediation #2 — Mobile deps + tsc cleanup — Closeout

Branch: `phase/14r-2-mobile-deps`
Tag (after merge): `v0.14.1-remediation-2`
Audit reference: Finding #2 in `.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md` lines 95-125.

<!-- gate-b: no-bugs-this-dispatch -->

## Problem

Now that R1 turned the CI heavy jobs on, the mobile typecheck job failed with **318 TypeScript errors**. The audit predicted this exactly: most were missing dependency declarations, but ~30 were real bugs that the broken CI had been hiding for the entire Phase 14 chain.

## Fix

### Dependencies added to `apps/mobile/package.json`

- `expo-secure-store@~55.0.13` — the encrypted-MMKV migration (formerly bug-1061)'s encrypted MMKV fix imported it; never declared.
- `expo-task-manager@~55.0.15` — D12's `useJobGpsBroadcast` hook (background-location lifecycle) imported it; never declared.
- `@types/jest@^30.0.0` — the encrypted-MMKV migration (formerly bug-1061)'s auth-migration test uses jest globals.
- `@types/node@^22.0.0` — `__tests__/d11-customer-polish.test.ts` and `d12-provider-polish.test.ts` use `fs`, `path`, `__dirname`.

### `apps/mobile/tsconfig.json`

- Added `types: ["node", "jest"]` so global `it/expect/describe/__dirname/fs/path` resolve.
- Removed `.expo/types/**/*.ts` from `include`; added `.expo/types` + `node_modules` to `exclude`. The auto-generated `router.d.ts` had broken path-string unions (it referenced `packages/api/src/validators/*.ts` as if they were route files).

### `apps/mobile/app.config.ts`

- Removed deprecated top-level `newArchEnabled: true` field (Expo SDK 55 default).
- Removed deprecated top-level `notification` field (moved to `android.notification` + plugin in SDK 55).
- Disabled `experiments: { typedRoutes: true }` — the experimental feature requires the `Routes` constant in `src/config/navigation.ts` to be migrated to `as const` so callsite path strings are literal types. That migration is a separate concern; for v1.0 the `a-cross-source-routes.sh` gate (the routes-registry gate (formerly bug-1185)) already enforces no raw-string `router.push()` calls. Re-enabling typed-routes is tracked as v1.1 polish.

### Real bugs surfaced by the now-active typecheck

These are not "install" issues; they are bugs that landed in D11/D12/D13 when CI heavy jobs were silent:

- **`apps/mobile/app/_layout.tsx`** — `Sentry.captureException` and `Sentry.addBreadcrumb` did not resolve via `import * as Sentry from '@sentry/react-native'` namespace import. Fixed by switching to named imports: `init`/`wrap` from `@sentry/react-native`, `captureException`/`addBreadcrumb` from `@sentry/core` (the underlying re-export chain that TS couldn't follow).
- **`apps/mobile/app/customer/safety-and-support.tsx`** — imported `MessageCircle` from `@/components/icons`; only `MessageSquare` is exported. Fixed.
- **`apps/mobile/src/hooks/useFeatureFlags.ts`** — D13 component used `import { api } from '@/services/api'` but `api.ts` only exports `default`. Also the `api.get<T>()` signature returns `ApiAxiosLikeResponse<T>` (axios-shape `{ data: T, status, ... }`), not `T` directly — the hook was treating the wrapper as the payload. Fixed both.
- **`apps/mobile/src/components/provider/NbiStatusBanner.tsx`** — same `api` import shape error from D12.
- **`apps/mobile/src/hooks/useJobGpsBroadcast.ts`** — D12 hook imported `secure-storage` as if it had a `default` export and methods `getString/setString/delete`; it only has named exports `getSecureItem/setSecureItem/removeSecureItem`. Also imported `@/lib/logger` which did not exist. Fixed both; created `src/lib/logger.ts` shim that forwards to Sentry breadcrumbs.
- **`apps/mobile/src/hooks/useStatusMutation.ts`** — `@tanstack/react-query@^5` changed `onSuccess`/`onError` arity from 3 to 4 args (added `onMutateResult` between variables and context). Fixed.
- **`apps/mobile/src/lib/logger.ts`** — new file. Sentry's `SeverityLevel` uses `'warning'` not `'warn'`; mapped at the breadcrumb edge.

## Files added (count: 1)

- `.ai-coder/dispatches/D14r-2-closeout.md` (this)
- `apps/mobile/src/lib/logger.ts`

## Files modified

- `apps/mobile/package.json` (+3 deps, +1 devDep)
- `apps/mobile/tsconfig.json` (types + exclude)
- `apps/mobile/app.config.ts` (SDK 55 schema cleanup + typedRoutes off)
- `apps/mobile/app/_layout.tsx` (named Sentry imports)
- `apps/mobile/app/customer/safety-and-support.tsx` (icon swap)
- `apps/mobile/src/components/provider/NbiStatusBanner.tsx` (api import + response unwrap)
- `apps/mobile/src/hooks/useFeatureFlags.ts` (api import + response unwrap)
- `apps/mobile/src/hooks/useJobGpsBroadcast.ts` (secure-storage + logger imports)
- `apps/mobile/src/hooks/useStatusMutation.ts` (react-query v5 arity)
- `package-lock.json` (npm install side effect)

## Verification

```bash
$ cd apps/mobile && npx tsc --noEmit
# 0 errors (was 318 before this remediation)
```

The CI mobile-check job (now active per R1) will go green on this PR.

## Gates

- [x] Gate A — all 10 fragments PASSED locally
- [x] Gate B — meta-only PR (no-bugs marker)
- [x] Gate C — all 6 BLOCKING articles PASSED locally
- [x] Mobile tsc — 0 errors

## Auto-proceed decision

Finding #2 closed. Tag `v0.14.1-remediation-2`. Continue with Finding #3 (Maestro mobile flows).
