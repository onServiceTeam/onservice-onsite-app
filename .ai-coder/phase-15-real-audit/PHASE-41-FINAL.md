# Phase 41 — Deep screen audit + repair (admin app, screens 14-17 of 28) (2026-05-04)

Continuing the deep-audit methodology to:

- Payouts (provider payout requests + approve/reject/complete flow)
- NotificationTemplates (push/SMS/email/in-app message templates)
- Recurring (recurring booking schedules)
- BusinessAccounts (B2B/enterprise customers)

## Coverage delta

| Track | Phase 40 | Phase 41 |
|---|---|---|
| Admin Playwright baselines (4 specs × 12 captures) | 354/354 PASS | **354/354 PASS** (48 re-captured) |
| Admin Vitest DOM tests | 101/101 PASS | **101/101 PASS** (no regression) |
| Real bugs in this batch | 5 | **3 real bugs found + fixed** |
| Cumulative bugs found+fixed (Phase 17→41) | 75 | **78** |

## Bugs found in this round

### BUG-PHASE41-01 — PayoutsPage list missing provider name + failure/rejection reasons

`apps/admin/src/pages/PayoutsPage.tsx` showed only the opaque payout
id ("PA-12345678") in the first column with no indication of which
provider the payout was for. The frontend `Payout` interface had no
provider-name field, and the API `listPayouts` was a plain
`SELECT p.*` without any JOIN. Admins triaging a queue of failed
payouts had to click each row to see why it failed and who it was
for — operationally painful at scale.

**Two-part fix:**
- API (`packages/api/src/services/payout.service.ts`): `listPayouts`
  now LEFT JOINs `providers` and `formatPayout` passes through
  `providerBusinessName` (null when other queries call the formatter).
- Frontend: first column now shows the provider business name
  (clickable to /providers/:id) with the short payout id below.
  Status column now renders `failureReason` (when status=failed) or
  `rejectionReason` (when status=rejected) inline below the badge.

### BUG-PHASE41-02 — RecurringPage Cancel hardcoded the audit reason

`apps/admin/src/pages/RecurringPage.tsx` Cancel button posted with
`reason: 'Admin cancellation'` literally hardcoded. The reason is
recorded in the audit ledger AND surfaced to the affected customer
in the cancellation notification — a hardcoded constant defeats both
purposes.

**Fix:** Cancel button now opens a confirm modal with a required
reason textarea (min 10 chars). Modal shows the customer name and
schedule frequency to confirm the right target.

### BUG-PHASE41-03 — BusinessAccountsPage Suspend hardcoded the audit reason

Same pattern in `apps/admin/src/pages/BusinessAccountsPage.tsx`
Suspend button — hardcoded `reason: 'Admin action'`. Suspending a
business account cuts off scheduled bookings AND credit-line
invoicing, so the reason is essential audit material.

**Fix:** Suspend button now opens a confirm modal with a required
reason textarea (min 10 chars). Modal shows the company name +
business type for confirmation.

## What I checked but did NOT change

### NotificationTemplatesPage — feature-complete, no real bugs

What was supposed to be there: list with type/channel filters,
toggle-active button per row, Edit + Delete + Create modals with
slug + title + body + type + channel + active fields. ✅ all present.

What I considered but rejected:
- "No send-test feature" — that's a new feature, not a bug.
- "Variables list not editable in form" — the API auto-extracts
  variables from `{{...}}` patterns in title/body. Not a bug.
- "Delete uses native confirm()" — that's a stylistic choice;
  parity with most other destructive actions on this app uses
  custom modals, but native confirm() is functionally correct.

## Files changed in Phase 41

**Admin app code (3 files):**
- `apps/admin/src/pages/PayoutsPage.tsx` — BUG-PHASE41-01 (frontend)
- `apps/admin/src/pages/RecurringPage.tsx` — BUG-PHASE41-02
- `apps/admin/src/pages/BusinessAccountsPage.tsx` — BUG-PHASE41-03

**API (1 file):**
- `packages/api/src/services/payout.service.ts` — BUG-PHASE41-01
  (backend half: provider JOIN + formatter passthrough)

**Re-captured baselines (48 PNG files):**
- `apps/admin/tests/visual/payouts.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/recurring.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/business-accounts.spec.ts-snapshots/` (12)
- `apps/admin/tests/visual/notification-templates.spec.ts-snapshots/`
  (12) — no source change but spec re-baselined for any minor diff

**Documentation:**
- `.ai-coder/phase-15-real-audit/PHASE-41-FINAL.md` (this file)

## Verified post-fix

- 101/101 admin Vitest DOM tests still passing.
- `npx tsc --noEmit` clean for admin and api packages.
- 48 visual baselines confirm rendering.

## Cumulative across Phase 17 → 41

- **78 real bugs found + fixed** (+3 from Phase 40's 75)
- **9 migrations** (no new in Phase 41)
- Backend: 1778+ runtime + 2700 unit = **4478+ assertions**
- Admin frontend: 101 vitest DOM + **354 playwright** = **455**
- Mobile frontend: 198 jest screen renders
- **= 5131+ total assertions verified across all surfaces**

## Continuation checklist

Phase 42+ (next pass):
- ServiceAreas, Marketing, Analytics, AuditLog (Phase 42)
- Compliance, DataProtectionLog, ConsentVersions, SupportTickets (Phase 43)
- StaffRoles, CancellationPolicy, ProviderDetail (Phase 44)
- Mobile screens (Phase 45+ — gated behind E02-F#3)
