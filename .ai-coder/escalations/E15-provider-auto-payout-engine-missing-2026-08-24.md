# E15 — Provider auto-payout settings have no execution engine

**Date:** 2026-08-24  
**Status:** OPEN — Ken decision required  
**Hard-stop reason:** Money-path behavior and production providers are affected.

## Bad news first

The provider Payout Settings screen says that daily, weekly, bi-weekly, and
monthly payouts happen automatically. The database stores those choices, but
no worker, scheduler, service, or route consumes them to create a payout.

This is not an empty-state theory. The production database currently has five
provider records. Three use `manual`; one uses `monthly`; one uses `biweekly`.
There are currently no payout rows. No production data was changed during this
audit.

The admin Financials screen also labels `pendingCount` as “Upcoming Scheduled.”
The API explicitly sets `upcomingScheduledCount: pendingCount` because the
payout state machine has no scheduled status. This is not a real schedule.

## Evidence

### Provider UI promises behavior that does not exist

`apps/mobile/app/provider/payout-settings.tsx` presents:

- Daily: “Automatic payout every day”
- Weekly: “Automatic payout every Monday”
- Bi-weekly: “Payout every 1st and 15th”
- Monthly: “Automatic payout on the 1st”
- Threshold: “Auto-payouts trigger only when your balance exceeds this amount”

The screen saves the values through `PUT /api/v1/wallet/payout-preferences`.

### API only stores and returns preferences

`packages/api/src/routes/wallet.routes.ts` reads and writes:

- `providers.payout_frequency`
- `providers.payout_min_threshold`
- `providers.payout_preferred_method`
- `providers.payout_destination_account`

A repository-wide search found no runtime consumer of those fields outside
that GET/PUT route. There is no auto-payout worker in
`packages/api/src/jobs/workers.ts` and no scheduler registration for payout
generation.

### Admin presents a proxy as a schedule

`packages/api/src/services/financial-admin.service.ts` documents that there is
no `scheduled` payout state and returns `upcomingScheduledCount: pendingCount`.
`apps/admin/src/pages/FinancialsPage.tsx` renders that number as “Upcoming
Scheduled.” The admin therefore cannot see the two stored provider schedules,
the next due time, whether a schedule was attempted, or why it did not run.

### Payout-method contract is also split

The provider screen and manual withdrawal service use:

- `gcash`
- `maya`
- `bank_instapay`
- `bank_pesonet`

`updatePayoutPreferencesSchema` instead accepts the obsolete
`bank_transfer` value and rejects both current bank rails. The settings route
also does not call `payout.service.validateDestinationAccount`, so malformed
GCash, Maya, InstaPay, or PESONet destinations can be stored even though a
manual payout would reject them.

Production currently stores `gcash` for all five providers, so this rail mismatch
has not corrupted production rows. It still makes the bank options on the
settings screen unsaveable.

## Why implementation is paused

Creating automatic withdrawals requires product and money-handling decisions
that the repository does not answer:

1. Does “daily” run at midnight, a morning cutoff, or after each eligible
   escrow release?
2. What happens on weekends and Philippine bank holidays?
3. Is the threshold tested before or after fees, holds, disputes, AML review,
   and in-flight payout reservations?
4. Can a provider have more than one payout in flight?
5. How many retries occur, on what schedule, and which failures require the
   provider to edit their destination?
6. Does changing a payout destination require OTP, account-name verification,
   or an admin review?
7. Which external transfer product is authoritative for GCash, Maya, InstaPay,
   and PESONet, and is it enabled in the live PayMongo account?
8. Should the two providers who selected non-manual cadences be contacted or
   reverted to manual before launch?

Choosing defaults would create real financial obligations and could initiate
duplicate, mistimed, or misrouted payouts.

## Decision options

### Option A — Launch-safe manual-only mode (recommended now)

- Stop offering automatic frequencies until an execution engine exists.
- Explain that providers request withdrawals from Earnings.
- Keep the two existing non-manual production values unchanged until Ken
  decides how those providers should be handled; surface them to admin as
  “configuration not active.”
- Remove the fake “Upcoming Scheduled” admin KPI or label it honestly.
- Align the settings validator with the current four payout methods and apply
  the same destination validation used by manual withdrawal.
- Add behavioral tests proving the UI makes no automatic-payout promise and
  invalid destinations cannot be saved.

This prevents new false expectations without moving money or rewriting
production preferences.

### Option B — Build the complete auto-payout engine

This needs a written policy for the eight questions above, then:

- scheduled payout state and due-at timestamps;
- an idempotent Manila-time scheduler;
- wallet reservation and concurrency protection;
- AML, dispute, hold, and available-balance gates;
- transfer-provider integration for each offered rail;
- retry and terminal-failure handling;
- provider notifications and destination-repair flow;
- admin schedule, attempt, exception, and manual-intervention tooling;
- audit events, reconciliation, migrations, and end-to-end money tests.

### Option C — Leave the current screen in place

Not recommended. It continues accepting promises the platform cannot fulfill
and leaves two production providers with silent non-working schedules.

## Required Ken decision

Choose Option A or Option B. If Option B, provide or approve the payout policy
answers above and confirm the live transfer provider/rails. No payout settings,
production rows, payout records, or external transfers will be changed until
that decision is recorded.
