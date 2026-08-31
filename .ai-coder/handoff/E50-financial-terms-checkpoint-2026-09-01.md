# E50 immutable financial terms checkpoint

**Date:** 2026-09-01
**Branch:** `codex/system-settings-control-fix`
**Production:** untouched

## What this checkpoint changes

- Adds immutable, versioned booking financial terms.
- Adds effective-dated global tier, category, and provider commission agreements.
- Makes escrow release, partial release, cancellation, provider receipts, and
  booking commission previews consume the booking-specific agreement.
- Retires mutable commission settings from the live settings editor.
- Adds a super-admin Commission Controls panel with prospective scheduling,
  reason, confirmation, cancellation, and audit history.
- Adds a fail-closed legacy review queue for paid or held bookings that predate
  immutable terms. Historical values must be supported by cited evidence and
  reproduce the booking's recorded service fee exactly.
- Makes admin commission analytics use the effective-dated base agreements,
  excluding provider and booking exceptions.
- Gives providers a redacted lead detail and quote path with the applicable
  booking commission preview.

## Verification completed

- API: 656 suites passed, 1 suite skipped by its own config, 3,159 tests passed.
- Admin: 244 files passed, 1 skipped, 336 tests passed, 3 existing todos.
- Mobile: 501 suites passed, 880 tests passed, 84 existing todos.
- API, admin, and mobile typechecks passed.
- ESLint passed for `apps` and `packages`.
- API TypeScript production build passed.
- Admin Vite production build passed.
- Gate A passed all 10 blocking fragments.
- Gate C and all six gate smoke-test groups passed.
- Gate D and Gate E exited successfully in their repository-defined REPORT mode.
- All 151 migrations, including migration 162, previously applied successfully
  to a disposable PostgreSQL 17 database with the repository's uuidv7 shim.

The Docker-only nginx certificate-revocation test was not executable because
Docker Desktop's daemon was unavailable. This is an environment limitation,
not a passing result.

## Remaining money-path work before production

1. Persist pre-payment pricing evidence when booking, quote, change-order, or
   other authoritative pricing is accepted. Payment authorization must preserve
   that evidence rather than reading whatever fee settings happen to be current.
2. Inventory every production paid/held/unreleased booking.
3. Review and approve each legacy booking's historical terms through the queue.
4. Reconcile each record before release-path rollout.
5. Add explicit operator adjustment, partial-refund, rate-reduction, and
   provider/customer exception workflows linked to Booking 360 and support cases.
6. Re-audit the remaining source-regex tests and replace them with real behavior
   tests or honest todos.

Do not merge or deploy this checkpoint until the first four items are satisfied
and the deployment runbook includes a rollback-safe migration sequence.
