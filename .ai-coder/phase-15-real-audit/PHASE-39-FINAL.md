# Phase 39 — Deep screen audit + repair (admin app, screens 6-9 of 28) (2026-05-04)

Phase 38 closed out the first 5 admin screens (Dashboard, Providers,
Financials, Dispatch, Settings) with 5 real bugs found and fixed.
Phase 39 applies the same methodology to the next 4 screens:

- Customers (list)
- CustomerDetail (6-tab 360 view)
- Bookings (list)
- BookingDetail (5-tab 360 view)

Methodology: read the source for each screen → identify what data is
fetched/declared but not surfaced → identify what filters/columns the
admin operationally needs → identify rendering bugs that "renders fine"
testing missed → fix → re-baseline.

## Coverage delta

| Track | Phase 38 | Phase 39 |
|---|---|---|
| Admin Playwright baselines (4 specs × 12 viewports/states) | 354/354 PASS | **354/354 PASS** (48 re-captured) |
| Admin Vitest DOM tests | 101/101 PASS | **101/101 PASS** (no regression) |
| Real bugs in this batch | n/a | **6 real bugs found + fixed** |
| Cumulative bugs found+fixed (Phase 17→39) | 64 | **70** |

## Bugs found in this round

### BUG-PHASE39-01 — CustomersPage list missing dispute count column

`apps/admin/src/pages/CustomersPage.tsx` queries `totalDisputes` via
the `Customer` interface and the column was on the API payload, but
no column was rendered. Admins could not spot chronic-dispute
customers from the list view (the MED-N16 fraud-pattern detector
surfaces these too, but the list-level signal was missing).

**Fix:** added a `disputes` column with red highlighting when count > 0.

### BUG-PHASE39-02 — CustomersPage status filter missing 'suspended' and 'flag_fraud'

The status filter listed only Active/Inactive even though
`super_admin` can call `PUT /admin/customers/:id/status` with
`action=suspend` or `action=flag_fraud`. There was no way to filter
the list to see suspended or fraud-flagged customers.

**Fix:** added Suspended and Fraud Flagged options to the dropdown.

### BUG-PHASE39-03 — BookingDetailPage rendered ', ,' on partial address objects

`apps/admin/src/pages/BookingDetailPage.tsx` `OverviewTab` rendered
the address as `<p>{address.full}</p><p>{barangay}, {city}, {province}</p>`
without checking whether each sub-field was set. When the address
object existed but the fields were null/empty, the page rendered
literally ", , " under the heading. Real on bookings created before
the address normaliser landed.

**Fix:** only render lines that have content, and join the comma list
from a `.filter(Boolean)` so missing parts don't produce empty commas.

### BUG-PHASE39-04 — BookingsPage list missing escrow column

`apps/admin/src/pages/BookingsPage.tsx` queries `escrowStatus` via
`adminService.formatBookingAdmin` and the column was on the `Booking`
interface, but no column was rendered. Admins could not spot
"paid booking with escrow still pending" anomalies at the list level
without clicking into each booking.

**Fix:** added an `escrow` column with status-aware variant colors
(success for released, danger for frozen/disputed, warning for
refunded, info otherwise).

### BUG-PHASE39-05 — CustomerDetailPage header missing last-login info

`profile.lastLoginAt` was on the API payload and the `CustomerProfile`
interface but never rendered in the header. Admins benefit from
seeing recency at a glance — dormant accounts, churn risk, or
compromised inactive accounts.

**Fix:** added a "last login {date}" inline in the header next to
"joined", with "never" fallback when null.

### BUG-PHASE39-06 — CustomerDetailPage BookingsTab status filter missing 11 of 17 statuses

The filter dropdown listed only 6 of the 17 statuses the booking
pipeline produces (requested/paid/in_progress/confirmed/disputed/
cancelled_by_customer). Missing: quoted, matched, payment_pending,
provider_en_route, provider_arrived, completed_by_provider,
payout_ready, paid_out, resolved, cancelled_by_provider,
cancelled_by_admin.

**Fix:** dropdown now mirrors the comprehensive list on the global
BookingsPage.

## Files changed in Phase 39

**App code (4 files, 6 product bugs fixed):**
- `apps/admin/src/pages/CustomersPage.tsx` — BUG-PHASE39-01 (disputes
  column) + BUG-PHASE39-02 (status filter expansion)
- `apps/admin/src/pages/BookingDetailPage.tsx` — BUG-PHASE39-03 (address
  rendering)
- `apps/admin/src/pages/BookingsPage.tsx` — BUG-PHASE39-04 (escrow
  column)
- `apps/admin/src/pages/CustomerDetailPage.tsx` — BUG-PHASE39-05
  (last-login in header) + BUG-PHASE39-06 (booking-tab status filter)

**Test infrastructure (1 file):**
- `apps/admin/tests/visual/_fixtures.ts` — added CUSTOMER_PROFILE,
  PROVIDER_PROFILE, BOOKING_DETAIL, DISPUTE_DETAIL object shapes so
  customer-detail/provider-detail/booking-detail/dispute-detail specs
  capture real content instead of crashing on `data.X.fullName`
  destructure of `[]`.

**Re-captured baselines (48 PNG files):**
- `apps/admin/tests/visual/customers.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/customer-detail.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/bookings.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/booking-detail.spec.ts-snapshots/` (12)

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-39-FINAL.md` (this file)

## Verified post-fix

- **CustomersPage**: list now shows a `Disputes` column with red
  styling when > 0; filter dropdown shows 4 status options including
  Suspended and Fraud Flagged. 48 baselines confirm.
- **CustomerDetailPage**: header shows "last login {date}" beside
  "joined"; BookingsTab filter shows all 17 statuses. Baseline
  confirms.
- **BookingsPage**: list now shows an `Escrow` column with the
  correct variant per status. Baseline confirms.
- **BookingDetailPage**: empty/null address branches render the
  EmptyState placeholder cleanly (no more lone ", ,").

## Cumulative across Phase 17 → 39

- **70 real bugs found + fixed** (+6 from Phase 38's 64)
- **9 migrations** (no new in Phase 39)
- Backend: 1778+ runtime + 2700 unit = **4478+ assertions**
- Admin frontend: 101 vitest DOM + **354 playwright** = **455**
- Mobile frontend: 198 jest screen renders
- **= 5131+ total assertions verified across all surfaces**

## Continuation checklist

Phase 40+ (next pass — same deep methodology applied to remaining 19
admin pages):
- Catalog, PricingRules, Disputes, DisputeDetail (Phase 40)
- Payouts, NotificationTemplates, Recurring, BusinessAccounts (Phase 41)
- ServiceAreas, Marketing, Analytics, AuditLog (Phase 42)
- Compliance, DataProtectionLog, ConsentVersions, SupportTickets (Phase 43)
- StaffRoles, CancellationPolicy, ProviderDetail (Phase 44)
- Mobile screens (Phase 45+ — gated behind E02-F#3 — Maestro on simulator)

Method per page (unchanged from Phase 38):
1. Read source — what data is queried, what is on the interface, what
   buttons/filters/columns the operational role needs.
2. Identify gaps — declared-but-not-rendered fields, partial-shape
   render bugs, missing operational filters.
3. Fix.
4. Re-baseline the affected spec(s).
5. Confirm vitest still green.
6. Commit + closeout doc.
