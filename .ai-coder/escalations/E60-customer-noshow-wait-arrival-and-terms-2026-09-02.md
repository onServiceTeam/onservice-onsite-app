# E60: Customer no-show wait is not measured from verified arrival or fixed terms

**Date:** 2026-09-02

**Status:** OPEN: money-path policy and remediation required
**Hard-stop reason:** The provider no-show control can change the no-refund
boundary for existing bookings, and the route does not prove the provider was
on-site for the wait it claims to enforce.

## Bad news first

`provider_noshow_minutes` serves two different purposes:

1. the worker uses it to send a non-financial **Provider May Be Late** alert;
2. the provider report route uses it to cancel as customer no-show and run the
   zero-refund cancellation split.

The money route requires current status `provider_arrived`, but calculates the
wait from `scheduled_at`. It never reads the time the provider entered the
arrived state. A provider who arrives late can mark arrived after the configured
scheduled-time threshold and immediately pass the check, even though the error
copy says the provider must be on-site for the full configured wait.

The setting is also read at action time. Lowering it can change the money
boundary for bookings that were already priced, accepted, paid, and scheduled.
No booking snapshot records which wait was agreed for that transaction.

No cancellation, refund, booking, setting value, wallet, or production data was
changed during this audit.

## Evidence

- `packages/api/src/jobs/workers.ts:detectNoShows()` compares `scheduled_at` to
  the current setting to send provider-late alerts.
- `packages/api/src/routes/booking.routes.ts:/:id/report-no-show` checks
  `status='provider_arrived'`, but compares `Date.now()` only with
  `scheduled_at`. It then calls the customer-no-show cancellation path inside a
  transaction.
- The live customer-no-show cancellation row is 0% refund and remains separately
  held under E09 because display and settlement sources disagree.
- `docs/operations/07-provider-support-sop.md` said 15 minutes after arrival,
  while the database/default and API use 30 minutes after scheduled time.

## Immediate containment

The Admin setting is now classified as **Launch hold** and is non-editable in
the API and Admin UI. This prevents an operator from changing existing booking
outcomes through an ordinary setting edit. Runtime behavior and the stored
30-minute default remain unchanged pending the money decision.

The provider support SOP now states the implementation gap and requires staff
to treat the route as E60-held rather than promising that it proves 30 minutes
on-site.

## Recommended permanent design

1. Split `provider_late_alert_minutes` from `customer_no_show_wait_minutes`.
2. Keep the provider-late alert operational and independently tunable.
3. Version the customer no-show policy and snapshot its exact wait and refund
   terms onto each booking no later than payment authorization.
4. Record an authoritative provider-arrived timestamp and require the wait to
   elapse after both the scheduled time and verified arrival.
5. Preserve arrival evidence, contact attempts, location/check-in evidence, and
   the policy version in Booking 360 before a no-refund decision.
6. Make the settlement idempotent and serialize it with dispute/cancellation
   actions on the same booking.
7. Show both parties the snapshotted rule before payment and in the exact
   booking, while Admin sees the evidence and policy version used.

## Required decision

Approve the recommended split, snapshot, and verified-arrival model before the
customer no-show path is launch-ready. Do not bypass the setting hold or treat
scheduled-time passage alone as proof the provider waited on-site. Independent
non-money audit work can continue.
