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
- Records fixed-price creation and accepted-quote pricing evidence inside the
  same transaction as the booking change. Payment authorization carries that
  evidence forward instead of rereading newer fee or cancellation settings.
- Makes Booking 360 partial refunds booking-scoped, support-case-linked, and
  replay-safe. Wallet-funded refunds return to the customer wallet atomically.
- Creates payment-only retry work in the refund transaction so a process stop
  after local commit cannot strand the external/accounting step or re-debit
  escrow. Initial worker eligibility is delayed so the worker cannot race the
  request handler's immediate payment attempt. Cancellation and dispute
  post-commit retries use the same payment-only action after their local money
  movement has committed.
- Gives the operator accurate feedback for a completed wallet refund, completed
  payment refund, queued payment retry, idempotent replay, or manual-attention
  state. A gateway-funded production refund with no valid PayMongo payment ID
  now stays unreconciled instead of being falsely marked processed.
- Makes release paths understand an operator partial refund. Customer
  confirmation, auto-confirm, force-complete, and manual release now calculate
  the booking's ledger remainder and prorate the original immutable terms, so
  the provider/platform remainder is neither stranded nor funded from another
  booking's escrow. Manual-release totals now include the guarantee allocation.
- Replaces the CRIT-N10 booking-confirmation and MED-N166 wallet-withdrawal
  source-text checks with executed route behavior. The confirmation test now
  proves commit, rollback, and post-commit receipt-failure behavior; the
  withdrawal test proves provider-only delegation and service-error
  propagation.
- Replaces the CRIT-N11 admin-session source scan with executed login, TOTP
  verification, forced-enrollment, and refresh requests. Each path proves the
  bearer secrets remain in HttpOnly cookies and never enter response JSON.
- Replaces the remaining MED-N28 admin-dispute and scheduler source scans with
  executed behavior. Full-refund, partial-release, and provider-release
  failures now prove their exact durable retry payloads; the worker proves its
  bounded batch size and five-minute repeat registration.
- Replaces the MED-N19, MED-N155, and MED-N160 source scans with executed
  dispute and webhook behavior. Automatic no-show refunds now prove database
  rollback when the ledger write fails; mounted dispute routes prove the
  read-only ordinary-admin and mutating super-admin boundary; signed payment
  amount mismatches prove exact alert metadata, best-effort alert failure
  handling, completed idempotency state, and zero money movement.
- Replaces the MED-N42 consent source scan with executed rollback behavior. A
  failed revocation-history insert now proves the prior active consent remains
  active and no phantom revocation event is stored.
- Replaces the MED-N02, MED-N73, and launch-limit #12 admin-control source
  scans with executed behavior. Mounted routes now prove audit-filter
  validation, super-admin boundaries for bulk password rotation, DPO access to
  self-service rotation only, and mandatory-rotation signaling across password,
  TOTP, and forced-enrollment login paths. Escrow release tests now execute both
  standalone and composed release paths and stop before wallet/terms work when
  the assigned provider was suspended during the booking.
- Replaces MED-N86 and MED-N96 route-security source scans with mounted HTTP
  behavior. Customer direct assignment records exact security metadata without
  making audit availability part of booking availability; admin assignment is
  not mislabeled. Anonymous provider-detail access is blocked while the
  authenticated services, schedule, ratings, portfolio, certifications, and
  suki-count response remains intact.
- Replaces MED-N08 and MED-N09 Booking 360 evidence source scans with executed
  service contracts. The admin evidence view consumes legacy and current
  non-deleted photos in one normalized chronological result and retains stable
  empty GPS/receipt fields without querying nonexistent tables.
- Replaces the MED-N68 provider-cancellation source scan with transaction
  behavior. The provider penalty update uses the booking transaction client,
  counts the freshly cancelled row once, and aborts the parent transaction when
  cancellation accounting cannot be recorded.
- Replaces the MED-N29 and MED-N102 admin-tunability source scans with executed
  service behavior. A newly configured marketing channel is accepted without a
  deploy, operator tier weights reorder providers in both matching paths, and
  unreadable values use canonical fallbacks. The settings transaction test now
  also proves a successful audited save invalidates both the per-key and grouped
  settings caches before downstream readers continue.
- Fixes OPS-299/OPS-300 in the provider payout handoff. The wallet facade now
  shares the canonical payout request schema, so account-holder name and notes
  are no longer stripped before payout creation. The responsive provider
  withdrawal screen captures an optional account-holder name and sends the
  trimmed value through to the payout record already shown to finance staff.

## Verification completed

- API: 679 suites passed, 1 suite skipped by its own config, 3,087 tests passed.
- Admin: 248 files passed, 1 skipped, 340 tests passed, 3 existing todos.
- Mobile: 502 suites passed, 881 tests passed, 84 existing todos.
- API, admin, and mobile typechecks passed.
- ESLint passed for `apps` and `packages`.
- API TypeScript production build passed.
- Admin Vite production build passed.
- Gate A passed all 10 blocking fragments.
- Gate C and all six gate smoke-test groups passed.
- Gate D and Gate E exited successfully in their repository-defined REPORT mode.
- All migrations through 162 previously applied successfully to a fresh
  disposable PostgreSQL 17 database with the repository's uuidv7 shim.
- Migration 163 then applied successfully to that disposable database; the
  partial unique refund replay index and the widened retry-action constraint
  were inspected in PostgreSQL after application.

The Docker-only nginx certificate-revocation test was not executable because
Docker Desktop's daemon was unavailable. This is an environment limitation,
not a passing result.

## Remaining money-path work before production

1. Inventory every production paid/held/unreleased booking.
2. Review and approve each legacy booking's historical terms through the queue.
3. Reconcile each record before release-path rollout.
4. Add explicit operator goodwill credits and post-settlement financial
   correction workflows. Partial refund is now implemented; old transactions
   must remain immutable and corrections must be append-only.
5. Before E14 external payments can be enabled, add provider-reconciled refund
   operation handling for uncertain PayMongo outcomes. Do not blindly retry an
   external refund after an ambiguous network/process failure.
6. Re-audit the remaining source-regex tests and replace them with real behavior
   tests or honest todos.

Do not merge or deploy this checkpoint until the first three items are satisfied
and the deployment runbook includes a rollback-safe migration sequence.
