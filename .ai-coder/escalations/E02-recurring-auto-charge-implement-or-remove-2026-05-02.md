# Escalation E02 — Recurring booking `auto_charge` flag: implement or remove

**Date:** 2026-05-02
**From:** AI coder (fixes session)
**Audit refs:** MED-N114, MED-N115 (PHASE-N findings)
**Dispatch:** D-J22
**Class:** Architectural decision (hard stop per CLAUDE.md §"Hard stops" #3)

---

## What's broken

`recurring_bookings.auto_charge` (BOOLEAN, default TRUE) is defined in
the schema (`packages/api/migrations/020_recurring_bookings.sql:36`)
and surfaced in the model (`recurring.service.ts:32`) and the API
response (`recurring.service.ts:492`).

The mobile app reads it (`apps/mobile/src/services/recurring.service.ts`).

But **nothing actually charges anything when `auto_charge=true`.** The
recurring scheduler just creates the next booking row and notifies
the customer. Payment still goes through the same manual flow as a
one-off booking. The flag is stored, displayed, and ignored.

## What this means for users

- Customer enables auto-charge in the recurring booking UI thinking
  they won't have to tap to pay each cycle.
- Booking instance is created on schedule.
- Customer still gets a payment-required notification, has to open
  the app and approve a charge.
- "Auto-charge" turns out to mean "auto-create-booking-needing-
  manual-payment".

This is a feature lie. We either deliver it or we stop showing it.

## Two paths

### Path A — Implement auto-charge against stored payment method

What changes:
1. Add `customer_default_payment_method_id` reference to
   recurring_bookings (nullable; stores the PayMongo source ID
   captured when the customer enabled auto-charge).
2. New migration to add the column + a status enum
   (`auto_charge_pending`, `auto_charge_succeeded`, `auto_charge_failed`).
3. Update the recurring scheduler job to:
   - On scheduled booking creation, if `auto_charge=true` AND
     `payment_method_id` is set, immediately call
     `paymongo.createPayment(source=stored_method)` against the
     booking total.
   - On success, advance booking to `confirmed` + send "charged
     ₱X for your recurring service" notification.
   - On failure (declined card, expired source), fall back to
     manual-payment flow + send "auto-charge failed, please pay"
     notification.
4. Wallet integration: if customer's wallet balance covers the
   total, debit wallet first, then PayMongo for the remainder.
5. Mobile UI: the toggle now requires the customer to first capture
   a payment source via the in-app PayMongo sheet (currently the
   toggle is purely cosmetic).
6. Admin alert if auto-charge fails 3 times in a row → suspend the
   recurrence.

Estimate: 2 sessions (migration + scheduler change + wallet integ +
mobile UI + admin alerting + tests).

Trade-off: real value-add for retained customers. Touches money path
so needs careful test coverage.

### Path B — Remove the flag from schema + UI

What changes:
1. Migration to drop `auto_charge` column from `recurring_bookings`
   (or keep the column but DEFAULT FALSE + comment-deprecate it).
2. Remove the toggle from mobile recurring booking creation UI.
3. Remove the field from `Recurring` API response.
4. File a v1.1 ticket if/when the feature is wanted.

Estimate: 1/2 session.

Trade-off: clean shipped surface, no over-promise. Customers who
expected the feature will be disappointed but at least won't be
surprised.

## My recommendation

**Path B for v1.0 launch.** Auto-charge against stored cards is a
PCI/AML conversation we haven't had yet — storing PayMongo source IDs
and silently charging them is a different compliance posture than
manual-confirm payments. Doing this well takes 2 sessions plus a
review of our PayMongo agreement. Doing it poorly is worse than not
shipping it.

Remove now, deliver properly in v1.1 when we have:
- A documented PCI scope review.
- An admin "kill switch" for runaway auto-charges.
- Customer-facing "review and confirm before each charge" toggle.

## What I need from Ken

Choose A or B. Reply in chat or write the answer in
`.ai-coder/decisions/D22-recurring-auto-charge.md`.

If A, I'll execute the 6-step plan and ship in ~2 sessions.
If B, I'll execute the 4-step plan and ship in ~1/2 session.
