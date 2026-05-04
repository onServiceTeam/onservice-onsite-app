# Phase 37 — Screen-level audit (admin + mobile UI surfaces) (2026-05-04)

Phase 17→36 audited backend routes, services, and three product
features. Phase 37 is **screen-level**: the 28 admin pages + 84 mobile
screens. Different axis, same standard — every screen identified,
mapped, tested, and (where possible) visually baselined.

## Coverage delta

| Track | Phase 36 | Phase 37 |
|---|---|---|
| Admin app screen inventory + mapping | partial | **28 pages mapped** to routes/files/APIs/tables (SCREEN-INVENTORY.md) |
| Admin Vitest DOM tests (existing) | unverified | **101/101 PASS + 3 todo** |
| Admin Playwright visual baselines | 0 captured | **348/348 captured + deterministic re-run** |
| Mobile app screen inventory | partial | **84 screens mapped** |
| Mobile Jest screen tests (existing) | unverified | **198/220 PASS, 22 todo** |
| Bugs found + fixed | 55 cumulative | **55 + 4 (3 spec bugs + 1 real app bug) = 59** |

## Real bugs fixed in Phase 37

**4 bugs found and fixed** (3 in spec template, 1 in real app code):

### CRIT-PHASE37-01 — All 28 non-login Playwright specs captured the LOGIN page

The `tests/visual/*.spec.ts` template did not seed an admin auth state
before navigating. Every protected route (29 of 30 admin routes)
redirects to `/login` for unauthenticated users. Result: 28 of 29
specs were capturing the login screen, not the actual target page.

The `348 passing` claim from the first capture run was technically
true (Playwright's screenshot stability check passed) but
**functionally misleading** — visual-diff would only catch login-screen
changes, not changes to any of the 28 protected pages.

**Fix:** Created `apps/admin/tests/visual/_fixtures.ts`, a Playwright
extended fixture that:
1. Routes /auth/me to return a fake super_admin user (so the auth
   store hydrates as logged-in)
2. Default-routes /api/v1/admin/** GETs to sensible empty shapes (KPI
   object for /dashboard/kpis, paginated list for everything else)
3. Wraps page.goto() to await `networkidle` so screenshots capture
   settled state

Updated all 29 specs to `import { test, expect } from './_fixtures'`.

### CRIT-PHASE37-02 — 5 Playwright spec route constants didn't match App.tsx

5 specs navigated to routes that don't exist in the admin router,
so they rendered the 404 page instead of the target page:
- `dashboard.spec.ts`: `/dashboard` → should be `/`
- `cancellation-policy.spec.ts`: `/cancellation-policy` → `/settings/cancellation-policy`
- `dispatch-console.spec.ts`: `/dispatch-console` → `/dispatch`
- `staff-roles.spec.ts`: `/staff-roles` → `/staff`
- `system-settings.spec.ts`: `/system-settings` → `/settings`

**Fix:** Updated each spec's `ROUTE` constant to match `App.tsx`.

### CRIT-PHASE37-03 — Default API mock returned wrong shape for KPI endpoint

After CRIT-PHASE37-01 fix, the dashboard's KPI useQuery received
`data: []` from the default mock. The page destructures `data.revenue`
etc, so `[].revenue` was `undefined`. Combined with BUG-PHASE37-01
this manifested as `₱NaN` cards.

**Fix:** Fixture detects `/dashboard/kpis` URL and returns an object
shape with all numeric fields zeroed. Other endpoints still get the
empty paginated array shape.

### BUG-PHASE37-01 — `formatCurrency` produces `₱NaN` for nullish input

`apps/admin/src/lib/format.ts:5` returned `formatCurrency(undefined / 100)
= formatCurrency(NaN) = '₱NaN'`. Affected the dashboard's Revenue,
Platform Escrow, Platform Revenue, Guarantee Fund cards whenever the
admin API returned nullish values (fresh launch, low traffic, mocked
test envs, race condition during initial KPI compute).

**Fix:** Coerce nullish/NaN/non-finite to `0` so users see `₱0.00`
instead of `₱NaN`. Real numbers pass through unchanged. The function
signature now accepts `number | null | undefined`.

This is a **real product bug**, not just a test artifact — any admin
opening the dashboard before KPIs were computed would see the broken
display.

## Screen inventory + mapping

See `.ai-coder/phase-15-real-audit/SCREEN-INVENTORY.md` for the full
table. Summary:

**Admin app (28 pages, 30 routes):**
- 1 public page (login)
- 1 forced-rotation page (change-password — LL#12)
- 26 protected admin/super_admin/dpo pages
- 1 catch-all 404
- Every page mapped to: code file, role gate, primary APIs, primary
  DB tables, verification status

**Mobile app (84 screens, file-based Expo Router):**
- 5 auth screens
- 4 customer tabs + 35 customer feature screens
- 4 provider tabs + 24 provider feature screens
- 8 provider onboarding screens
- 4 root-level screens (index, onboarding, _layout)

## Verified

**Admin DOM render tests (Vitest @testing-library/react):**
- 31 suites passed, 1 skipped (32 total)
- 101 tests passed, 3 todo (104 total)
- Run from `apps/admin/`: `npm test`

**Admin Playwright visual baselines:**
- 29 specs × (4 states × 3 viewports) = **348 baseline PNGs**
- Captured against live admin dev server at http://localhost:7382
- All 348 PASS deterministic across multiple runs (no flakes)
- Run from `apps/admin/`: `npx playwright test`
- Located in `apps/admin/tests/visual/<page>.spec.ts-snapshots/`
- Total baseline size: ~22 MB

**Mobile screen render tests (Jest @testing-library/react-native):**
- 84 screen suites pass + 17 cross-cutting tests
- 220 tests total: **198 pass + 22 todo**
- Run from `apps/mobile/`: `npx jest --testPathPatterns="screens/"`

**Sampled visual baselines verified to render real content:**
- DashboardPage: KPI cards + charts + alerts + wallet cards (₱0.00, no NaN)
- ProvidersPage: search + filters + provider table (No providers found)
- FinancialsPage: 7 tabs + KPI cards + revenue breakdown (₱0.00)
- DispatchConsolePage: Leaflet map + active bookings + live alerts
- SystemSettingsPage: Platform Settings + Flush cache button

## NOT autonomously testable (E02 hard-stops)

**Mobile baselines on real device (F#3):**
- 84 screens have Jest render tests + Maestro YAML flows committed
- Capturing Maestro screenshot baselines requires iOS Simulator
  (macOS/Xcode) or Android Emulator (AVD + nested virtualisation),
  neither available in autonomous environment
- See E02 escalation file for Ken's specific actions + ~2-4h estimate

**Mobile app interactive testing against real React Native runtime + native modules** — same iOS sim / Android emulator constraint.

## Cumulative across Phase 17 → 37

- **59 real bugs found + fixed** (+4 from Phase 36's 55)
- **9 migrations** (no new in Phase 37 — all fixes were app/test code)
- **Backend assertions:** 1778+ runtime + 2700 unit-test = 4478+
- **Admin frontend assertions:** 101 vitest DOM + 348 playwright visual = 449
- **Mobile frontend assertions:** 198 jest screen renders
- **= 5125+ total assertions verified across all surfaces**
- **+1 latent route wired** (PII reveal — Phase 30b)
- **+3 product features shipped** (quiet hours, offer cycle — Phase 36)
- **+E02 launch-pends escalation written**

## Files changed in Phase 37

**App code (1 file):**
- `apps/admin/src/lib/format.ts` — BUG-PHASE37-01 (formatCurrency NaN handling)

**Test infrastructure (30 files):**
- `apps/admin/tests/visual/_fixtures.ts` (NEW) — Playwright fixture
- `apps/admin/tests/visual/*.spec.ts` (29 files) — import path updated
  + 5 wrong ROUTE constants corrected

**New baselines (348 files, ~22 MB):**
- `apps/admin/tests/visual/<page>.spec.ts-snapshots/*.png`

**Documentation (2 files):**
- `.ai-coder/phase-15-real-audit/SCREEN-INVENTORY.md` — full inventory
- `.ai-coder/phase-15-real-audit/PHASE-37-FINAL.md` — this file

## Operational items surfaced for Ken/ops

- **F#4 (Playwright baselines) is now COMPLETE for admin app.** 348
  baselines captured, deterministic, committed. CI can now flag
  visual-diff regressions on every PR. Update launch-cutover runbook
  to mark F#4 as DONE for admin (mobile F#3 still pending — see E02).
- **`formatCurrency` was a real bug.** Pre-fix any dashboard load
  with nullish KPI fields (e.g., before the first analytics aggregate
  cron runs after launch) showed `₱NaN`. Post-fix shows `₱0.00`.
- **Spec auth fixture is reusable.** When new admin pages are added
  in v1.1+, the new spec file just needs `import { test, expect } from
  './_fixtures'` — auth + default mocks + networkidle wait come for
  free. Document this in apps/admin/tests/visual/README.md if/when
  someone adds the next page.
- **Spec route constants are now correct.** When new pages are added,
  cross-check against `apps/admin/src/App.tsx` to avoid the
  CRIT-PHASE37-02 trap (silently rendering 404 instead of target).
- **Mobile baselines remain pending.** E02-F#3 is unchanged. Ken/contractor
  needs Mac+Xcode or Linux+Android Studio for ~2-4h to capture them.

## Continuation checklist

Stack still up. Files added:
- `.ai-coder/phase-15-real-audit/SCREEN-INVENTORY.md`
- `.ai-coder/phase-15-real-audit/PHASE-37-FINAL.md`
- `apps/admin/tests/visual/_fixtures.ts` + 348 baseline PNGs
- `apps/admin/src/lib/format.ts` (NaN-hardened)

Phase 38+ (if user continues):
- Wire `sweepExpiredOffers` into the BullMQ scheduler (Phase 36b
  follow-up — currently must be invoked manually)
- Drive interactive admin tests via Chrome MCP if/when the extension
  reconnects (full keystroke-by-keystroke screen drill that complements
  the Playwright visual baselines)
- Capture mobile Maestro baselines (E02-F#3 — needs Ken)
- F#10 attorney-reviewed disclaimer wording (E02-F#10 — needs Ken)
- 12 D14 ops items (E02 — needs Ken)
