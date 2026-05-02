# D22 — Recurring auto-charge: real implementation (Path A)

**Date:** 2026-05-02
**Decided by:** Ken (chat instruction: maximal effort, no lazy path)
**Resolves:** Escalation E02

---

## Decision

**Path A — Real auto-charge against stored payment method.** Reject Path B (delete the toggle).

## Rationale

Storing+ignoring the `auto_charge` flag is a feature lie. Ken's standing instruction (2026-05-02): "I want you to do the maximal effort, not the decision that removes things or takes a lazy route which we have to go back and do later anyways. it should be done now."

## PCI/AML posture

This implementation never stores raw card numbers. It stores PayMongo's source/payment-method ID (a tokenized reference). Charges are made via PayMongo's API server-side. PCI scope is unchanged — we remain a SAQ A merchant (card data never touches our servers). PayMongo agreement permits stored-source recurring use; the customer-side consent screen captures the explicit recurring-charge authorization.

## Execution plan

1. Migration:
   - `recurring_bookings.payment_method_id` (TEXT, nullable) — PayMongo source/PM ID.
   - `recurring_bookings.auto_charge_status` (TEXT, default NULL) — `pending|succeeded|failed`.
   - `recurring_bookings.auto_charge_consecutive_failures` (INT, default 0).
   - `recurring_bookings.auto_charge_suspended_at` (TIMESTAMPTZ, nullable).
   - Index on `(auto_charge=TRUE, next_booking_date)` for the scheduler.

2. Scheduler change (`processRecurringBookings`):
   - On scheduled booking creation, if `auto_charge=true` AND `payment_method_id` is set AND not suspended:
     - Create booking row.
     - Wallet-first: if customer wallet covers total → debit wallet, mark booking paid.
     - Remainder via PayMongo: `paymongo.createPayment(source=payment_method_id, amount=remainder)`.
     - Success → flip booking to `confirmed`, send "we charged ₱X for your recurring service" notification, reset failure counter.
     - Failure → fall back to manual flow, increment failure counter, send "auto-charge failed" notification. If counter >= 3, set `auto_charge_suspended_at`, alert admin via in-app notification + Slack.
   - If `auto_charge=true` but no payment method → fall through to manual (current behavior). Notify customer to capture a method.

3. Service: `recurring.service.ts` exposes `setAutoChargePaymentMethod(recurringBookingId, paymongoMethodId)` and `clearAutoChargePaymentMethod(...)`.

4. Mobile UI: toggle now opens a PayMongo capture sheet. On capture, calls `PUT /recurring/:id/auto-charge` with the captured method ID. Persists customer-facing consent text.

5. Admin alert path: 3 consecutive failures → suspend recurrence + create admin notification (type `recurring_auto_charge_suspended`) + post Slack incoming-webhook.

6. Tests: scheduler path (success, partial-wallet, decline, soft-suspend), service-layer set/clear method, audit/notification on suspend.
