# E59: No-show auto-refund uses timing alone and can outlive held escrow

**Date:** 2026-09-02

**Status:** OPEN: money-path policy and remediation required
**Hard-stop reason:** A customer no-show claim can automatically issue a full
refund from scheduled-to-completed timing alone, and E18 shows that the same
dispute may arrive after provider funds were released.

## Bad news first

`dispute.service.ts` automatically resolves a newly filed `no_show` dispute as
a full refund whenever the provider completion timestamp is less than an Admin
threshold after the scheduled timestamp. It does not first evaluate provider
arrival, work-start evidence, checklist proof, photos, messages, GPS evidence,
customer confirmation, or a provider response.

The editable `noshow_auto_resolve_window_minutes` row allowed values from 1 to
1,440 minutes. The condition is `minutesBetween < threshold`, so raising the
threshold widens the set of claims that receive an automatic full refund. The
older MED-N18 comment says raising the default from 5 to 30 minutes reduced
false positives, but the implemented comparison does the opposite.

No refund behavior, booking, wallet, setting value, or production data was
changed during this audit.

## Evidence

- `packages/api/src/services/dispute.service.ts:attemptAutoResolution()` reads
  only `scheduled_at`, `completed_at`, and the setting before resolving the
  dispute, marking the booking refunded, and moving the full booking amount.
- `packages/api/migrations/153_settings_registry_alignment.sql` permits 1 to
  1,440 minutes.
- `packages/api/__tests__/dispute-auto-resolve-trx-med-n19.test.ts` proves the
  transaction rolls back safely on a ledger error, but intentionally treats a
  two-minute completion as enough to award the full refund. It does not prove
  the underlying entitlement decision is fair or correct.
- E18 proves the advertised dispute window can remain open after escrow was
  released to the provider. The automatic path does not implement a provider
  clawback model.

## Immediate containment

The Admin setting is now classified as **Launch hold** and is non-editable in
both the API and Admin UI. This prevents an operator from silently widening or
narrowing the refund rule while its authority is unresolved. Existing runtime
behavior and the stored/default value remain unchanged.

## Options

### Option A: Disable timing-only auto-refunds for launch (recommended)

Route every no-show claim to the shared customer/provider/Admin dispute case.
Keep money held through the approved dispute window, let the provider contest,
and require a reasoned Admin decision from available evidence. This is the
smallest rule that does not award money from a timestamp proxy.

### Option B: Build a multi-signal automatic decision

Define required arrival, work-start, location, checklist, photo, message, and
customer evidence; define exceptions and appeals; hold funds through that
decision; and add an idempotent, versioned policy with concurrency tests.

### Option C: Keep the timing proxy

Approve an exact threshold and legal/operations policy, resolve E18 first, and
accept that short legitimate jobs can match the same timing pattern. This is
not recommended.

## Required decision

Approve Option A, B, or C together with E18's escrow-window choice. Until then,
do not bypass the Settings hold or represent timing-only auto-resolution as a
launch-ready no-show policy. Independent non-money audit work can continue.
