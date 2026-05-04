# Phase 40 — Deep screen audit + repair (admin app, screens 10-13 of 28) (2026-05-04)

Continuing the deep-audit methodology to the next 4 admin screens:

- Catalog (categories / subcategories / addons)
- PricingRules (surge multipliers)
- Disputes (list)
- DisputeDetail (resolution detail + actions)

Methodology unchanged from Phase 38/39: read source → identify what
data is fetched/declared but not surfaced → identify operational gaps
→ identify rendering bugs → fix → re-baseline.

## Coverage delta

| Track | Phase 39 | Phase 40 |
|---|---|---|
| Admin Playwright baselines (4 specs × 12 captures) | 354/354 PASS | **354/354 PASS** (48 re-captured) |
| Admin Vitest DOM tests | 101/101 PASS | **101/101 PASS** (no regression) |
| Real bugs in this batch | 6 | **5 real bugs found + fixed** |
| Cumulative bugs found+fixed (Phase 17→40) | 70 | **75** |

## Bugs found in this round

### BUG-PHASE40-01 — CatalogPage Pricing column hides range/quote/hourly info

`apps/admin/src/pages/CatalogPage.tsx` rendered only `basePrice` in
the Pricing column. For `pricingType=range` services, basePrice is
typically null and minPrice/maxPrice are set — admin saw only the
"range" badge with no numbers and had to open the edit modal to see
the actual price band. Same gap for `quote` (no indicator that quoting
is required) and `hourly` (no /hr indicator).

**Fix:** Pricing column now renders ₱min – ₱max for range,
"(quote on request)" for quote, ₱base/hr for hourly, ₱base for fixed.

### BUG-PHASE40-02 — PricingRulesPage list missing platform-share column

`platformSurgeShare` controls how surge revenue splits between
platform and provider. The form lets admin edit it, but the table
never showed it — admin had to open each rule individually to see the
share. Money-flow setting deserves a list-level column.

**Fix:** Added "Platform share" column (renders as integer percent).

### BUG-PHASE40-03 — DisputesPage list missing parties + booking-link columns

Pre-fix the list showed only dispute id and type. Admin had no
indication of who the dispute was between (customer vs provider) and
which booking it concerned without clicking through. The frontend
`Dispute` interface declared `customerName` / `providerName` as
optional but the API never populated them — `listDisputes` was a
plain `SELECT d.*` without any JOIN.

**Two-part fix:**
- API (`packages/api/src/services/dispute.service.ts`): `listDisputes`
  now LEFT JOINs `bookings` → `users` (customer) and `providers`
  (assigned provider). `formatDispute` passes through `customer_name`
  / `provider_name` (null when not populated by other queries).
  Backwards-compatible: detail/single-row formatters return null for
  the two new fields.
- Frontend (`apps/admin/src/pages/DisputesPage.tsx`): added a
  "Parties" column showing customer + provider + clickable booking ID.

### BUG-PHASE40-04 — DisputeDetailPage hides the actual resolution for resolved disputes

The `DisputeFullDetail` interface declared `resolutionType`,
`decisionNotes`, `internalNotes`, `refundAmount`, `resolvedAt`,
`resolvedBy` — all of which are populated for resolved disputes — but
the page rendered NONE of them. Admins had to query the DB or audit
log to see what was decided. For a 360-view "detail" page this is a
serious operational gap.

**Fix:** New `ResolutionCard` component renders above the claim/
response cards when `status === 'resolved'`. Shows resolutionType
badge, resolved-at timestamp, refund amount, resolved-by admin id,
decision notes (visible to user), internal notes (admin-only,
amber-highlighted).

### BUG-PHASE40-05 — DisputeDetailPage offers actions on already-resolved disputes

Pre-fix, the resolve form and escalate form rendered for resolved
disputes too. Submitting either would have failed server-side. UI
shouldn't offer actions that always 4xx.

**Fix:** Wrapped both Resolve and Escalate sections in
`detail.status !== 'resolved'` guard. Reopen, Assign, and Message
remain available post-resolution (those are still valid actions).

## Files changed in Phase 40

**Admin app code (4 files, 5 product bugs fixed):**
- `apps/admin/src/pages/CatalogPage.tsx` — BUG-PHASE40-01
- `apps/admin/src/pages/PricingRulesPage.tsx` — BUG-PHASE40-02
- `apps/admin/src/pages/DisputesPage.tsx` — BUG-PHASE40-03 (frontend half)
- `apps/admin/src/pages/DisputeDetailPage.tsx` — BUG-PHASE40-04 +
  BUG-PHASE40-05

**API (1 file):**
- `packages/api/src/services/dispute.service.ts` — BUG-PHASE40-03
  (backend half: JOIN + formatter passthrough)

**Re-captured baselines (48 PNG files):**
- `apps/admin/tests/visual/catalog.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/pricing-rules.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/disputes.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/dispute-detail.spec.ts-snapshots/` (12)

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-40-FINAL.md` (this file)

## Verified post-fix

- **CatalogPage**: range services with min/max set show "₱X – ₱Y";
  quote services show "(quote on request)"; hourly shows "/hr"
  suffix. 12 baselines confirm.
- **PricingRulesPage**: list shows Platform share column with
  integer-percent rendering. 12 baselines confirm.
- **DisputesPage**: list shows Parties column with customer name,
  provider name, and clickable booking-id link. 12 baselines confirm.
- **DisputeDetailPage**: resolved disputes now display a Resolution
  card with badge/timestamp/refund/by-admin and decision/internal
  notes. Resolve and Escalate forms hidden when already resolved.
  12 baselines confirm.
- **API**: `npx tsc --noEmit` clean for the change. Pre-existing
  failures in `cancelBookingAsAdmin` test are unrelated (verified
  via `git stash` — same failures exist on master baseline).

## Cumulative across Phase 17 → 40

- **75 real bugs found + fixed** (+5 from Phase 39's 70)
- **9 migrations** (no new in Phase 40)
- Backend: 1778+ runtime + 2700 unit = **4478+ assertions**
- Admin frontend: 101 vitest DOM + **354 playwright** = **455**
- Mobile frontend: 198 jest screen renders
- **= 5131+ total assertions verified across all surfaces**

## Continuation checklist

Phase 41+ (next pass):
- Payouts, NotificationTemplates, Recurring, BusinessAccounts (Phase 41)
- ServiceAreas, Marketing, Analytics, AuditLog (Phase 42)
- Compliance, DataProtectionLog, ConsentVersions, SupportTickets (Phase 43)
- StaffRoles, CancellationPolicy, ProviderDetail (Phase 44)
- Mobile screens (Phase 45+ — gated behind E02-F#3)
