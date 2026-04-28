# Phase 09 — Honesty Check

## Mandate
Build the missing Stitch screens (39 screens audited as missing). Mobile-heavy + 1 admin page (Marketing).

## What was actually delivered

### Mobile (apps/mobile) — 8 NEW screens (Batches 09a + 09b core launch-critical & provider-job set)

| File | Purpose | Lines |
|---|---|---|
| `app/provider-onboarding/identity-verification.tsx` | Government ID capture (5-step wizard, expo-image-picker) | 515 |
| `app/provider-onboarding/background-check-status.tsx` | NBI status display + refresh + expandable FAQ | 313 |
| `app/customer/booking/payment-failed.tsx` | Failure reason + retry/switch-method/contact + 15-min countdown | 165 |
| `app/provider/job/[id]/navigate.tsx` | Google Maps + Waze deep links + "Mark Arrived" POST | 232 |
| `app/provider/job/[id]/checklist.tsx` | Sectioned categorized checklist with per-item photo + report-issue modal (REPLACED prior template-only stub) | 444 |
| `app/provider/job/[id]/complete.tsx` | 4 final photo slots + PanResponder signature + notes + submit | 349 |
| `app/provider/service-area.tsx` | In-app editable service area with `react-native-maps` MapView + 10-step radius picker | 256 |
| `app/provider/skills.tsx` | 12-category Switch + per-cat subcategory checkboxes + save POST | 397 |

Mobile total NEW: ~2,671 LOC across 8 files.

### Admin (apps/admin) — 1 NEW page

| File | Purpose | Lines |
|---|---|---|
| `src/pages/MarketingPage.tsx` | 3-tab page (Overview / Promo Codes / Campaigns) with TanStack Query CRUD + super-admin gating | 1222 |
| `src/App.tsx` | +2 lines (lazy import + route `/marketing`) | +2 |

### Backend (packages/api) — for the Marketing page

| File | Purpose | Lines |
|---|---|---|
| `migrations/056_marketing_promos_campaigns.sql` | `promo_codes` + `marketing_campaigns` tables (no admin_actions CHECK widening) | 42 |
| `src/services/marketing-admin.service.ts` | 11 exports: promo CRUD + campaign CRUD + getMarketingOverview (CPA + ROI) | 710 |
| `src/routes/marketing-admin.routes.ts` | Mounted `/api/v1/admin/marketing` (10 endpoints) | 255 |
| `src/server.ts` | +5 lines (import + mount BEFORE generic `/api/v1/admin`) | +5 |
| `__tests__/marketing-admin.test.ts` | 33 tests (validation, audit literals, CPA/ROI math, audit failure non-fatal) | 439 |

Tests: 735 pass / 735 total (was 702; +33).

## What was NOT delivered (carried forward as known gaps)

Phase 09 spec lists 39 screens. The audit reality is most already exist (verified at start by `ls apps/mobile/app/...` — 14 of 16 customer screens, 17 of 17 provider screens, 6 of 7 onboarding screens were present pre-Phase-09). This phase added the truly missing files and the admin Marketing page.

Explicitly NOT touched:
- Batch 09c "verify the existing" items (saved_payment_methods, add_card, recurring management, referrals) — already present and pass tsc; left untouched per do-not-modify-unrelated-files rule.
- Batch 09d polish items: live_chat_support, dashboard skeleton loaders system-wide, password_reset (mobile uses OTP — flow exists in auth/), change_phone_number, linked_accounts (OAuth — explicitly deferrable per spec).
- Batch 09e: StaffRolesPage / SystemSettingsPage / AuditLogPage — those exist from earlier phases; verifying every UI element vs spec is a separate audit task; left unchanged (no defects detected on file presence).
- `dispute_quality_control` admin screen: deferred (DisputesPage exists from Phase 06/07; SLA/accuracy KPIs not yet added).

## Sacred-file touches
- `packages/api/src/server.ts`: 1 import + 1 mount line, placed BEFORE generic `/api/v1/admin` mount. Money math unaffected.
- `apps/admin/src/App.tsx`: 1 lazy import + 1 `<Route>` element. No route side-effects.
- `apps/mobile/app/provider/job/[id]/checklist.tsx`: REPLACED prior stub with the spec'd categorized checklist implementation per Phase-09 spec line 91 ("verify it's the spec'd version") — old version was generic template, did not match the sectioned + per-item-photo + report-issue requirements.

## Money math
Marketing service uses BIGINT centavos throughout. CPA = `Math.round(spend / signups)` with 0-divisor guard. ROI% = `Math.round((revenue - spend) / spend * 100)` with 0-divisor guard. 4 dedicated tests cover both edges.

## Audit pattern
All audit rows use SQL LITERALS `action_type='config_changed'` / `target_type='config'` (already widened in migration 055). NO new admin_actions CHECK values added in migration 056 — only the 2 new tables.

## Verification
- `packages/api`: tsc clean, eslint clean, jest 735/735 pass.
- `apps/admin`: tsc clean, eslint clean, vite build success (MarketingPage chunk 21.13 kB).
- `apps/mobile`: tsc clean.
- repo-root: `npm run lint` clean (`exit 0`).
