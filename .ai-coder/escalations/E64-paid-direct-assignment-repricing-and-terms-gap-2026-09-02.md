# E64 — Direct provider assignment can reprice paid bookings and omit immutable provider terms

**Date:** 2026-09-02
**Status:** OPEN — explicit money-path approval required before committing the prepared fix
**Scope:** `POST /api/v1/bookings/:id/assign`, Suki assignment discounts, E50 immutable booking financial terms

## Bad news

The customer/admin direct provider-assignment route is not fully connected to
the approved E50 Option A financial-terms model.

The route currently:

1. reads the booking before its transaction;
2. calculates a provider-linked Suki discount;
3. can rewrite `service_price`, `service_fee`, and `total_amount` when assigning
   the provider; and
4. does not append provider-assignment or replacement pricing evidence to
   `booking_financial_terms`.

For a booking whose escrow is already held, this can reduce the booking total
without changing the amount already held. It also leaves release without the
provider-specific immutable commission agreement required by E50. A concurrent
payment can race the route's pre-transaction read and create the same problem
even if the booking appeared unpaid when the route began.

For an unpaid booking, a Suki discount changes the customer-visible total but
leaves the older pricing-evidence version in place. E50 payment authorization
then correctly rejects the stale amount instead of charging against evidence
that no longer matches.

## Evidence

- `packages/api/src/routes/booking.routes.ts`, direct assignment route
- `packages/api/src/services/booking-financial-terms.service.ts`
  - `appendAuthorizationTermsInTransaction` rejects amount drift from the
    latest pricing evidence.
  - `appendProviderAssignmentTermsInTransaction` is the approved held-money
    provider-agreement boundary.
- `packages/api/src/services/booking-offer.service.ts` already follows the
  correct E50 provider-assignment pattern for offer acceptance.
- E50 Option A is approved, but the repository's money-path safety gate
  requires a fresh explicit approval before this route behavior is committed.

No production data, GitHub branch, migration, or live server was changed for
this finding.

## Prepared Option A — preserve paid money and append evidence (recommended)

The prepared, uncommitted working-tree change:

1. locks the booking row with `SELECT ... FOR UPDATE` inside the assignment
   transaction;
2. rechecks the current booking status and escrow state after obtaining the
   lock;
3. never applies a new Suki discount when escrow is already `held` or
   `partially_refunded`;
4. preserves the exact paid service price, service fee, and total;
5. appends `provider_assigned` immutable financial terms in the same
   transaction, using the prior customer fee/cancellation evidence and the
   provider agreement effective at assignment;
6. records the skipped discount amount in metadata for operator audit; and
7. when the booking is still unpaid and a Suki discount legitimately changes
   its price, appends a replacement `booking_priced` evidence version before
   commit so later authorization sees the exact new amount.

This follows E50's non-retroactivity rule and the existing offer-acceptance
precedent. It does not refund, debit, release, migrate, or backfill money.

## Option B — prohibit direct assignment after payment

Reject customer/admin direct assignment whenever escrow is held and require the
offer/dispatch path instead. This is simpler, but removes a support recovery
tool and can strand paid bookings when dispatch needs manual intervention.

## Recommendation

Approve Option A. It preserves the customer's authorized amount, keeps manual
support assignment available, records the exact provider agreement, and closes
the payment/assignment race without inventing a retroactive adjustment.

## Work paused

The Option A source and behavior-test changes are prepared but intentionally
uncommitted. Per the repository money/compliance hard stop, do not commit,
push, deploy, or include them in another change until Ken explicitly approves
E64 Option A.
