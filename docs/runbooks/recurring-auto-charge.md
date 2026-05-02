# Runbook — Recurring auto-charge

**Owner:** product/engineering
**Compliance ref:** PCI DSS SAQ A (we never store card data)
**Established:** 2026-05-02 (Escalation E02 / Decision D22)

---

## What it is

When a customer enables auto-charge on a recurring booking and captures a payment method via the in-app PayMongo sheet, the recurring scheduler charges the customer automatically each cycle instead of asking them to tap-to-pay.

## How a charge actually happens

1. Daily cron calls `processRecurringBookings()` in `recurring.service.ts`.
2. For each due recurring row, the scheduler creates the booking instance and advances `next_booking_date` immediately. (This ordering matters — a charge failure can never block the recurrence's clock.)
3. If `auto_charge=TRUE`, the scheduler calls `attemptAutoCharge()` in `recurring-auto-charge.service.ts`.
4. `attemptAutoCharge`:
   - Re-loads the recurring row (FOR fresh state, not FOR UPDATE — multiple workers running this is rare and idempotent).
   - Skips if suspended (`outcome='skipped_suspended'`).
   - Skips if no `payment_method_id` (`outcome='skipped_no_method'`).
   - Wallet-first: debits the customer's wallet up to its available balance.
   - Charges PayMongo for the remainder against the stored `payment_method_id`.
5. On success: booking → `confirmed`, escrow held, `auto_charge_consecutive_failures` reset to 0, `recurring_auto_charge_succeeded` notification fired.
6. On failure: counter incremented; if it reaches the configured threshold (default 3), the row is suspended and `recurring_auto_charge_suspended` notification fires; otherwise just `recurring_auto_charge_failed` notification fires with a "please pay manually" CTA.

## Storage

We store **only** PayMongo's tokenized `payment_method_id` (e.g. `src_ABC...`). We never store raw card data. This keeps us at SAQ A.

Columns added to `recurring_bookings` (migration 107):
- `payment_method_id` — TEXT NULL — PayMongo source/PM token.
- `payment_method_label` — TEXT NULL — short label shown to customer (e.g. "Visa ending 4242").
- `auto_charge_status` — `pending|succeeded|failed|suspended`.
- `auto_charge_consecutive_failures` — INT default 0.
- `auto_charge_suspended_at` — TIMESTAMPTZ nullable.
- `auto_charge_last_attempt_at` — TIMESTAMPTZ nullable.

A separate audit table `recurring_auto_charge_attempts` records every attempt regardless of outcome (used by both customer-facing history UI and ops dashboards).

## Customer flow

1. Customer creates a recurring booking with `auto_charge=TRUE`.
2. Mobile UI prompts: "Save a payment method to enable auto-pay" — opens PayMongo sheet.
3. On capture, mobile calls `PUT /recurring/:id/auto-charge` with `{paymentMethodId, paymentMethodLabel}`.
4. Each cycle the customer gets either a "We charged ₱X" notification (success) or a "We couldn't charge — please pay manually" notification (failure).
5. After 3 consecutive failures, auto-charge is suspended. Customer must `PUT /recurring/:id/auto-charge` with a fresh method to resume.
6. Customer can `DELETE /recurring/:id/auto-charge` at any time to opt out.

## Admin / ops controls

- **Suspension threshold** is the platform setting `recurring_auto_charge_max_consecutive_failures` (default 3, range 1–10). Change via Settings → Platform.
- **Kill switch:** to suspend ALL auto-charges immediately, run `UPDATE recurring_bookings SET auto_charge_suspended_at = NOW() WHERE auto_charge = TRUE AND auto_charge_suspended_at IS NULL;` Document the rationale in the ops log. Customers will be notified on next attempted cycle.
- **Per-customer kill switch:** the customer can delete their saved method via the API, or ops can `UPDATE recurring_bookings SET payment_method_id = NULL, payment_method_label = NULL WHERE id = $1;`.

## Reconciliation runbook (when a PayMongo charge succeeds but our DB updates fail)

The auto-charge service logs `CRITICAL: auto-charge ledger update failed after PayMongo charge succeeded` in this case. The PayMongo ID is captured on the audit row with `failure_reason` prefixed `LEDGER_RECONCILE_NEEDED:`. To reconcile:

1. Pull the audit row(s):
   ```sql
   SELECT id, recurring_booking_id, booking_id, paymongo_payment_id, amount_centavos
   FROM recurring_auto_charge_attempts
   WHERE failure_reason LIKE 'LEDGER_RECONCILE_NEEDED:%';
   ```
2. For each: refund via PayMongo dashboard (the booking remains in `requested` status; customer will pay manually).
3. Or: manually fix the ledger by debiting the wallet, flipping the booking, and holding escrow — then mark the audit row as resolved.

## Failure modes

- **Customer's card expires.** PayMongo returns 402; we increment counter, eventually suspend. Customer notified to update.
- **Customer's wallet balance partially covers, PayMongo declines remainder.** We treat this as a full failure (no partial debit). The wallet is NOT debited. Customer pays manually for this cycle.
- **PayMongo API down.** Network error → counted as a failure. After 3 consecutive, suspended; ops should investigate before resuming.
- **Recurring row missing on attempt.** Audit row written with `outcome='failed'`, `failure_reason='recurring booking row missing'`. Investigate.

## Compliance notes

- We never auto-charge unless the customer enabled `auto_charge` AND captured a payment method via the sheet.
- The capture sheet shows the customer the recurring authorization explicitly (mobile UI requirement, separate from this backend doc).
- Customer can revoke at any time. Revocation is irreversible without a fresh capture.
- Suspension after 3 failures protects the customer from "runaway charges" against a bad card.

## Open follow-ups (v1.2+)

- Admin dashboard view for `recurring_auto_charge_attempts` (currently SQL-only).
- Slack incoming-webhook on suspend (currently in-app notification only).
- Per-recurring max-amount cap (so a price hike doesn't trigger surprise charges).
