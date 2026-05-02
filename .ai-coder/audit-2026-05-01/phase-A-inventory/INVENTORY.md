# Phase A — True Repo Inventory (2026-05-01)

Generated from filesystem `find | wc -l` at commit `b8bd2f2` on master.
Local matches origin/master. Working tree clean.

## Real line counts (no docs trusted, just `find` + `wc -l`)

| Module | Lines | Files | Notes |
|---|---:|---:|---|
| `packages/api/src` (all) | 43,503 | 159 | Backend code |
| → `services/` (60 files) | ~28,925 | 60 | Business logic — money, auth, ops |
| → `routes/` (41 files) | ~11,589 | 41 | HTTP endpoints |
| → `middleware/` (10 files) | included | 10 | Auth, RBAC, CSRF, rate-limit, audit |
| → `jobs/workers.ts` | 566 | 1 | Background job runner |
| → `services/booking/` subdir | 492 | 4 | Booking sub-services |
| → `services/pricing/cancellation.service.ts` | 268 | 1 | Cancellation refund math |
| `packages/api/__tests__` | 19,914 | 98 | API test suites |
| `packages/api/migrations` | 3,999 | 77 | SQL migrations 001–088 |
| `apps/admin/src` | 21,183 | 93 | React admin web app |
| → 29 page components catalogued | — | — | FinancialsPage 1405 lines, MarketingPage 1301, etc. |
| `apps/mobile/app` (screens) | 25,461 | 91 | Expo Router screens |
| → Customer screens | — | 41 | Including `(tabs)` and `customer/` |
| → Provider screens | — | 43 | Including `(provider-tabs)`, `provider/`, `provider-onboarding/` |
| → Auth screens | — | 7 | `auth/`, `index.tsx`, `_layout.tsx`, `onboarding.tsx` |
| `apps/mobile/src` | 10,039 | 107 | Mobile components, services, hooks |
| **TOTAL** | **~124,099** | **~624** | (Excluding `node_modules`, `dist`, `.expo`, etc.) |

The previous estimate of "~98k lines" was understated. Real number is **~124k lines** — about 26% larger than what was in your head.

## What's actually in `packages/api/src/services/` (60 files)

### Money path (12 files) — THE highest-risk area
- `booking.service.ts` — **1,197 lines**
- `booking-admin.service.ts` — **1,143 lines**
- `escrow.service.ts` — **759 lines**
- `payment.service.ts` — TBD (read in Phase B)
- `commission.service.ts` — TBD
- `wallet.service.ts` — TBD
- `payout.service.ts` — TBD
- `tip.service.ts` — TBD
- `dispute.service.ts` — **843 lines**
- `dispute-admin.service.ts` — **784 lines**
- `pricing.service.ts` — **411 lines**
- `services/booking/{from-quote,pricing,promo,surge}.service.ts` — 492 total
- `services/pricing/cancellation.service.ts` — 268 lines
- `promotion.service.ts` — TBD
- `referral.service.ts` — TBD
- `suki.service.ts` — TBD (loyalty/discount)
- `rebooking.service.ts` — TBD
- `reconciliation.service.ts` — 472 lines
- `invoice.service.ts` — 498 lines
- `or.service.ts` — 807 lines (Official Receipt — BIR)
- `bir-2307.service.ts` — 842 lines (BIR withholding tax)
- `vat-report.service.ts` — 645 lines
- `financial-admin.service.ts` — **1,065 lines**

### Auth + identity (4 files) — second-highest risk
- `auth.service.ts` — TBD
- `admin.service.ts` — 520 lines
- `admin-2fa.service.ts` — TBD
- `security.service.ts` — 524 lines

### Provider lifecycle (4 files)
- `provider.service.ts` — 808 lines
- `provider-admin.service.ts` — **999 lines**
- `provider-onboarding.service.ts` — TBD
- `provider-tools.service.ts` — 743 lines

### Customer-facing (9 files)
- `customer-admin.service.ts` — 904 lines
- `address.service.ts`, `service-area.service.ts` (634), `service-area-change.service.ts`
- `catalog.service.ts` — 711 lines
- `matching.service.ts`, `slot-waitlist.service.ts`, `recurring.service.ts` (513)
- `business.service.ts` — 681 lines (B2B)

### Ops + comms (10 files)
- `messaging.service.ts`, `notification.service.ts` (551), `notification-template.service.ts`
- `sms.service.ts`, `socket.service.ts`
- `support-ticket.service.ts`
- `staff.service.ts`, `marketing-admin.service.ts` (786)

### Compliance + admin (8 files)
- `compliance.service.ts` (678), `compliance-admin.service.ts` (489)
- `data-management.service.ts` (557) — DSR / GDPR / DPA
- `breach-log.service.ts`
- `admin-analytics.service.ts` — **1,314 lines** (largest file in services)
- `metrics.service.ts`, `cache.service.ts`, `settings.service.ts` (498)

## What's in `routes/` (41 files)

| Route | Lines | Risk |
|---|---:|---|
| `admin.routes.ts` | 1,614 | HIGH (largest route file) |
| `booking.routes.ts` | 1,025 | HIGH (money path) |
| `auth.routes.ts` | 977 | HIGH (auth path) |
| `provider.routes.ts` | 735 | MED |
| `catalog.routes.ts` | 466 | MED |
| `business.routes.ts` | 400 | MED |
| `wallet.routes.ts` | 342 | HIGH (money path) |
| `bir-admin.routes.ts` | 333 | HIGH (compliance) |
| `dispute.routes.ts` | 237 | HIGH |
| ... 32 more | | |

## What's in `migrations/` (77 files)

001 → 059 = Phase 13 era
070 → 088 = Phase 14 dispatches D01 → D13
- 088 most recent (`d13_feature_flags.sql`)
- 070 was `admin_csrf_tokens` (D02)
- 074 was `service_area_bounds_and_settings` (D05)

## Risk-ranked reading order for Phases B–G

**Highest risk first** — bugs here = lost pesos, broken trust, regulatory exposure.

### Phase B (Money path) — target ~10k–15k lines
Read in this order, bottom up (utilities first):
1. `utils/currency.ts` (full)
2. `services/booking/{pricing,promo,surge,from-quote}.service.ts` (full — 492 lines)
3. `services/pricing/cancellation.service.ts` (full — 268 lines)
4. `services/pricing.service.ts` (full — 411)
5. `services/payment.service.ts` (full — TBD)
6. `services/escrow.service.ts` (full — 759)
7. `services/commission.service.ts` (full — TBD)
8. `services/wallet.service.ts` (full — TBD)
9. `services/payout.service.ts` (full — TBD)
10. `services/tip.service.ts` (full — TBD)
11. `services/promotion.service.ts` (full — TBD)
12. `services/referral.service.ts` (full — TBD)
13. `services/suki.service.ts` (full — TBD)
14. `services/rebooking.service.ts` (full — TBD)
15. `services/booking.service.ts` (full — 1,197)
16. `services/reconciliation.service.ts` (full — 472)
17. `routes/booking.routes.ts` (full — 1,025)
18. `routes/wallet.routes.ts` (full — 342)
19. `routes/payment.routes.ts` (full — TBD)
20. `routes/payout.routes.ts` (full — TBD)
21. `validators/` for all of the above

### Phase C (Auth + RBAC) — target ~4k–6k lines
1. `middleware/auth.middleware.ts`
2. `middleware/rbac.middleware.ts`
3. `middleware/admin-csrf.middleware.ts`
4. `middleware/rate-limit.middleware.ts`
5. `middleware/ip-block.middleware.ts`
6. `middleware/audit.middleware.ts`
7. `services/auth.service.ts`
8. `services/admin-2fa.service.ts`
9. `services/security.service.ts`
10. `services/admin.service.ts`
11. `services/staff.service.ts`
12. `routes/auth.routes.ts` (977)
13. `utils/admin-cookies.ts`, `utils/totp.ts`, `utils/hcaptcha.ts`

### Phase D (Customer flows) — target ~12k–15k lines
All 41 customer screens + their wired API calls.

### Phase E (Provider flows) — target ~12k–15k lines
All 43 provider screens.

### Phase F (Admin) — target ~22k lines
All 29 admin pages including the giants:
- FinancialsPage 1,405
- MarketingPage 1,301
- CustomerDetailPage 1,117
- BookingDetailPage 1,068
- ProviderDetailPage 952
- DisputeDetailPage 868
- DispatchConsolePage 865
- CompliancePage 812

### Phase G (DB) — target ~4k lines
All 77 migrations + RLS policies + indexes.

### Phase H (Tests) — target ~20k lines
All 98 test files + 17 admin tests + mobile tests. Looking specifically for fake-passing patterns the F#7 audit caught.

## Honest budget per phase

I have a 1M-token context window. Reading 3,000 lines of TypeScript ≈ 60–80k tokens including my notes.

So per-phase realistic budget:
- One phase = up to ~10–15k lines read carefully, with running notes captured to a `findings/` doc as I go
- Each phase ends with an audit file the next session can resume from
- Total program = 8 phases × ~one focused session each

The honest version of what was promised before: the prior audit read ~4k lines. This audit will read **all 124k lines** across phases, with a written doc at every phase boundary so nothing is lost between sessions.

## Files NOT trusted

These docs may not match reality — they describe what was *intended*, not necessarily what shipped:
- `CLAUDE.md` (project instructions — describes process not state)
- `LAUNCH-LIMITATIONS.md` (a self-reported list — needs verification)
- `.ai-coder/dispatches/*` (dispatch closeouts — F#7 audit found three rounds of fake-passing tests in these)
- `docs/` directory (554K of docs — may be stale)

What IS trusted: the source code itself, the migrations, the actual test assertions (after Phase H verifies them).
