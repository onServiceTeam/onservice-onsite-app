# E20 — Recurring auto-charge is not launch-safe

**Date:** 2026-08-24
**Area:** Customer recurring bookings, PayMongo, wallet, escrow, booking lifecycle
**Severity:** Critical money-path hard stop
**Production exposure at discovery:** none. Production had 0 recurring rows and 0 auto-charge attempts.

## Bad news first

The implementation approved by D22 exists in code, but the actual end-to-end path is not safe to enable. A due recurring row with a stored payment token can charge the wrong amount and then put the generated booking into the wrong lifecycle state.

The production database was checked read-only on 2026-08-24. It contained:

- 0 recurring bookings;
- 0 active auto-charge recurring bookings;
- 0 due auto-charge recurring bookings; and
- 0 rows in `recurring_auto_charge_attempts`.

No customer has been charged by this path in the current production database. No production money or recurring row was changed during the audit.

## Confirmed defects

1. `recurring_bookings.total_amount` is already stored in centavos, but `processRecurringBookings()` multiplies it by 100 before passing it to `attemptAutoCharge()`.
2. `wallets.available_balance` is also stored in centavos (migration 005), but the auto-charge service treats it as pesos and multiplies it by 100. The compensating `/ 100` conversions later make a wallet-only debit appear to work, but a PayMongo-only or split wallet/PayMongo charge can send 100 times the intended remainder to PayMongo.
3. On success, the service changes a newly created `requested` booking directly to `confirmed`. In the canonical booking state machine, `confirmed` means the customer accepted a provider-completed job. A paid recurring booking should be `paid` with escrow held, then enter provider matching/job execution.
4. After directly creating a PayMongo payment, the service calls `createPaymentIntent()` as an audit step. That helper makes another external PayMongo payment-intent request and records it as awaiting payment, rather than recording the already-successful charge. This creates a duplicate, misleading external/payment record.
5. D22 and the runbook require a customer-facing PayMongo capture sheet and explicit recurring-charge consent. No such customer UI is present. The API accepts a caller-supplied payment/source ID and label, but the code does not verify through PayMongo that the token is reusable, belongs to the authenticated customer flow, or is suitable for recurring use.
6. The scheduler preserves the provider from the original booking without checking whether that provider remains approved, active, qualified, available, or in the service area. The documented `allow_substitute` behavior is not implemented.
7. The runbook says suspended auto-charge alerts an admin, but the implementation sends the supposed admin notification to the customer user ID a second time. There is no admin operations queue or dashboard for charge attempts/reconciliation.

## Source contradiction

D22 explicitly says a successful auto-charge should flip the booking to `confirmed`, but the canonical state machine reserves `confirmed` for the post-service customer-acceptance transition from `completed_by_provider`. D22 also says the mobile capture/consent screen exists, while the current screen inventory and code show that it does not.

That contradiction prevents silently choosing a replacement lifecycle and consent/tokenization design inside a broad UX audit.

## Required decision and implementation

The original product decision remains Path A: real recurring auto-charge. The recommended remediation is to keep that product direction, but treat the feature as disabled until one dedicated money-path change delivers all of the following together:

1. one centavo unit from catalog price through booking, wallet, PayMongo, escrow, notification, and audit rows;
2. a real PayMongo-supported reusable-payment setup flow with explicit customer consent and server verification;
3. `requested -> payment_pending -> paid` semantics (or another explicitly approved state-machine amendment), never `requested -> confirmed`;
4. an audit record for the actual successful charge without creating a second external intent;
5. provider eligibility and substitution/matching behavior;
6. a persistent reconciliation queue and real admin alert target;
7. end-to-end sandbox tests proving exact amounts for wallet-only, PayMongo-only, and split payment, plus failure/retry/idempotency tests; and
8. customer and admin screens for payment method, consent, attempt history, failure recovery, suspension, and reconciliation.

Until that work is complete, do not manually populate `payment_method_id` and do not treat recurring auto-charge as launch-ready.

## Safe containment applied during the audit

Bugs UX-189 through UX-191 and UX-196 now enforce the disabled state at the server boundary:

- `PUT /recurring/:id/auto-charge` returns 503 before accepting or storing a token;
- the recurring scheduler always creates a manual-payment booking and never calls the unsafe charge service, even if a legacy row still has `auto_charge=TRUE`;
- recurring API responses report that legacy preference as disabled and never return the stored reusable payment/source identifier; and
- new recurring series explicitly store `auto_charge=FALSE`, with migration 152 changing the database default for future rows without modifying existing series or payment evidence; and
- DELETE and attempt-history access remain available so a legacy preference can be cleared and support can inspect prior evidence.

This is containment, not implementation of the eight requirements above. The isolated legacy auto-charge service remains in code for audit/history and dedicated remediation, but it is no longer reachable from activation or scheduler execution.
