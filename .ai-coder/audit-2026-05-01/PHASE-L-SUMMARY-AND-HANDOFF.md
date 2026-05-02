# Audit 2026-05-01 — Phase L COMPLETE — Admin shared (non-page) source

**Status:** All 42 admin non-page files read line-by-line. Combined with Phase F's 88 page+test files, **130/130 admin files = 100% coverage**.

## Files fully read in Phase L (42 files, ~1,993 lines)

Per-batch breakdown documented in:
- PHASE-L-BATCH-01.md (App, main, auth.store, admin.config — 5 files)
- PHASE-L-BATCH-02.md (AdminLayout, Header, Sidebar, lib/*, hook — 8 files)
- PHASE-L-BATCH-03.md (UI components — 22 files)
- PHASE-L-BATCH-04.md (configs — 8 files)

## NEW MEDIUM findings from Phase L (5)

| ID | One-line | File:line |
|---|---|---|
| **MED-L01** | No 404 catch-all route in App.tsx; typo URLs render blank | App.tsx:52-83 |
| **MED-L02** | admin api.ts has correct getErrorMessage helper; mobile lacks the equivalent (root cause of MED-K04) | admin/src/lib/api.ts:163-167 |
| **MED-L03** | admin + mobile useFeatureFlags expect different response shapes for same /api/v1/config endpoint | admin/src/hooks/useFeatureFlags.ts:33-38 vs mobile/src/hooks/useFeatureFlags.ts:30-39 |
| **MED-L04** | vitest config swallows async errors via dangerouslyIgnoreUnhandledErrors:true | apps/admin/vitest.config.ts:14-26 |
| **MED-L05** | playwright.config.ts baseURL fallback `localhost:5173` doesn't match vite dev port `7382` | apps/admin/playwright.config.ts:7 vs vite.config.ts:14 |

## NEW CRITICAL findings from Phase L (0)

The admin web app's shared infrastructure is in good shape. Bug 1271 (native fetch) + Bug 1251 (HttpOnly cookies + CSRF) verified at code level. No new CRITs.

## POSITIVE findings worth noting

1. **Bug 1271 + Bug 1251 verified** in admin/src/lib/api.ts — correct CSRF token handling, credentials: 'include' for HttpOnly cookies, one-retry refresh pattern, redirect to /login on refresh fail.
2. **Bug 1170-admin-ui validation** in admin/src/lib/cancellation-policy-validation.ts — real validation logic mirrors server-side validators.
3. **Production-grade vercel.json CSP** — script-src locked, img-src S3-whitelisted, connect-src api.onservice.ph + sentry, X-Frame DENY, frame-ancestors 'none', Permissions-Policy disables camera/mic/geo.
4. **All 22 UI components are clean shadcn-style Radix wrappers** — accessibility roles (alert/status/busy/live), forwardRef pattern, CVA for Button variants.
5. **Sidebar.tsx superAdminOnly filter** with comment confirming server enforces same — defense in depth.
6. **AdminLayout.tsx is a real auth gate** — Navigate to /login if !isAuthenticated; loading spinner while hydrating.
7. **main.tsx has dev-only @axe-core/react** for runtime a11y violations in browser console (tree-shaken from prod).

## Cumulative running totals (after Phase L)

| | Total | Phase L additions |
|---|---:|---:|
| **CRITICAL** | **170 real** (1 invalidated of 171) | **+0** |
| **MEDIUM** | **462 + 5 = 467** | **+5** |
| Lines fully read | ~97,500 / 146,236 | +1,993 |
| Coverage | **66.7%** | +1.4% |

## Phase L → Phase M handoff

Admin app (23,976 lines) is now 100% covered. Mobile app (50,845 lines) is now 100% covered. Migrations (4,230 lines) are 100% covered.

**Remaining unread (~48,700 lines):**
- packages/api/src/services/ (28,925 lines) — partially covered in Phase B (money path); ~17k unread
- packages/api/src/routes/ (11,089 lines) — partially covered in Phase B/C/F; ~6k unread
- packages/api/src/middleware/ (500 lines) — fully unread
- packages/api/src/validators/ (795 lines) — fully unread
- packages/api/src/utils/ (653 lines) — fully unread
- packages/api/src/jobs/ (580 lines) — fully unread
- packages/api/src/config/ (304 lines) — fully unread
- packages/api/src/types/ (286 lines) — fully unread
- packages/api/src/server.ts (291 lines) — fully unread
- packages/api/src/seeds/, models/ (~80 lines) — fully unread
- packages/api/__tests__/ (~9k lines unread of 11k) — bucket-classified but not full-read
- scripts/ (2,837 lines) — fully unread
- infra/ (479 lines) — fully unread
- packages/api/migrations/seeds/ (~250 lines) — partially read

**Next: Phase M — API support layer (middleware + validators + utils + jobs + config + server + types + seeds + models)**

Total Phase M scope: ~3,500 lines / ~60 files. Smallest files (config/types/utils/middleware) first. Should land in 8-12 batches.

Continuing now into Phase M.
