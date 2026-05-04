# Phase 42 — Deep screen audit + repair (admin app, screens 18-21 of 28) (2026-05-04)

Continuing the deep-audit methodology to:

- ServiceAreas (geographic launch zones + provider coverage)
- Marketing (promo codes, campaigns, channel breakdown)
- Analytics (A/B tests, cohorts, churn, quality, commission)
- AuditLog (compliance trail of audit_log + admin_actions union)

## Coverage delta

| Track | Phase 41 | Phase 42 |
|---|---|---|
| Admin Playwright baselines (4 specs × 12 captures) | 354/354 PASS | **354/354 PASS** (48 re-captured) |
| Admin Vitest DOM tests | 101/101 PASS | **101/101 PASS** |
| Real bugs in this batch | 3 | **2 real bugs found + fixed** |
| Cumulative bugs found+fixed (Phase 17→42) | 78 | **80** |

## Bugs found in this round

### BUG-PHASE42-01 — ServiceAreasPage list missing customer-side metric

`apps/admin/src/pages/ServiceAreasPage.tsx` showed activeProviderCount
+ totalBookings but not `activeCustomerCount`, even though it's on the
`ServiceArea` interface and returned by the API. Demand-side visibility
is as critical as supply-side for ops decisions (when to launch, when
to scale).

**Fix:** Added "Customers" column with locale-formatted integer.

### BUG-PHASE42-02 — AuditLogPage missing date-range filter

The AuditLog has filters for action, entityType, source — but no way
to bound a query by date. Compliance audits ("show me all NPC entries
between 2026-04-01 and 2026-04-30") had to be done by paginating to
the right time slice manually. The API endpoint already supports
`from` and `to` query params — the UI just wasn't using them.

**Fix:** Added two `<input type=date>` fields to the filter row,
wired to the existing API params. Clear-filters button updated to
also reset dates.

## What I checked but did NOT change

### MarketingPage — feature-complete

Tabs (Overview / Promo Codes / Campaigns) all populated, date-range
picker present, proper KPI cards, channel breakdown table, full
CRUD on promos and campaigns. No surfacing gaps. ✅.

### AnalyticsPage — A/B tests gated for v1.0

Cohort, churn, quality, and commission tabs all complete. The A/B
tests tab is hidden behind `feature_flag.ab_testing_enabled` (false
in v1.0 per Phase 14 D13 Bug 45) so its incomplete create form (no
variantA/B name inputs) is not user-reachable. Acceptable for v1.0.

### ServiceAreasPage — `zipCodes` and `retired` action skipped

ServiceArea interface declares `zipCodes` array but no UI to view
or edit. There's no "retire" button despite the status enum
including 'retired'. Both gaps are intentional v1.1+ candidates;
not blocking for launch (`active`/`paused` covers ops needs in v1.0).

## Files changed in Phase 42

**Admin app code (2 files):**
- `apps/admin/src/pages/ServiceAreasPage.tsx` — BUG-PHASE42-01
- `apps/admin/src/pages/AuditLogPage.tsx` — BUG-PHASE42-02

**Re-captured baselines (48 PNG files):**
- service-areas, marketing, analytics, audit-log — 12 each.

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-42-FINAL.md` (this file)

## Verified post-fix

- 101/101 admin Vitest DOM tests still passing
- `npx tsc --noEmit` clean
- 48 visual baselines confirm

## Cumulative across Phase 17 → 42

- **80 real bugs found + fixed** (+2 from Phase 41's 78)
- **9 migrations** (no new in Phase 42)
- 5131+ total assertions verified across all surfaces

## Continuation checklist

Phase 43+:
- Compliance, DataProtectionLog, ConsentVersions, SupportTickets (Phase 43)
- StaffRoles, CancellationPolicy, ProviderDetail (Phase 44)
- Mobile screens (Phase 45+ — gated behind E02-F#3)
