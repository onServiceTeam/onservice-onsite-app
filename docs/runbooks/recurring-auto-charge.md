# Runbook: recurring payments

**Owner:** product/engineering
**Established:** 2026-05-02 (Escalation E02 / Decision D22)
**Safety status:** automatic charging disabled on 2026-08-24 under Escalation E20

## Current production behavior

Recurring scheduling is available, but every generated booking requires manual
payment. The platform does not accept a reusable payment method for a recurring
series and the scheduler does not call the legacy auto-charge service.

This containment remains mandatory until E20 is resolved through an approved
money-path design, PayMongo sandbox testing, ledger reconciliation testing, and
explicit customer-consent review.

## How a recurring booking is created

1. The daily scheduler calls `processRecurringBookings()`.
2. It atomically claims the due occurrence in `recurring_instances`.
3. It creates the real booking and links that booking to the occurrence.
4. It advances the series to its next date.
5. It tells the customer that the booking was created and must be paid manually
   before service.

New recurring series explicitly store `auto_charge=FALSE`. Migration 152 also
sets FALSE as the database default for future rows without rewriting existing
series or payment evidence.

If an old row still has `auto_charge=TRUE`, the scheduler records a warning and
continues with manual payment. It never invokes `attemptAutoCharge()`.

## API controls

- `PUT /api/v1/recurring/:id/auto-charge` always returns HTTP 503 and does not
  accept or store the submitted payment method.
- `DELETE /api/v1/recurring/:id/auto-charge` remains available so a customer can
  clear an old preference and legacy token.
- Recurring API responses always report `autoCharge: false`, never return a
  reusable payment token, and report a legacy enabled preference as `disabled`.
- Attempt history remains readable for support and reconciliation.

## Legacy schema and code

Migration 107 added auto-charge columns to `recurring_bookings` and the
`recurring_auto_charge_attempts` audit table. The isolated
`recurring-auto-charge.service.ts` remains in the repository for audit history
and dedicated tests, but no production route or scheduler is allowed to call
its charge function while E20 is open.

Do not delete legacy tokens or attempt rows as part of a broad cleanup. A
customer can clear their own legacy token through the DELETE route. Any wider
cleanup requires a separately reviewed migration and a production backup.

## Support checks

Use read-only queries first:

```sql
SELECT COUNT(*) AS legacy_enabled
FROM recurring_bookings
WHERE auto_charge = TRUE;

SELECT outcome, COUNT(*)
FROM recurring_auto_charge_attempts
GROUP BY outcome
ORDER BY outcome;
```

For a specific customer complaint, confirm that the generated booking is still
in a manual-payment state and review its ledger entries before changing any
data. Escalate any unexpected PayMongo charge immediately. Do not attempt to
repair a charge by editing wallet, escrow, booking, or ledger rows independently.

## Prohibited operations while E20 is open

- Do not re-enable the PUT route.
- Do not reconnect `attemptAutoCharge()` to the recurring scheduler.
- Do not expose a saved payment token in customer, provider, or admin APIs.
- Do not describe recurring bookings as auto-pay in product or support copy.
- Do not manually set `auto_charge=TRUE` or add a payment method in production.
- Do not treat the legacy failure-threshold setting as an operational switch.

## Launch gate

Recurring auto-charge can be reconsidered only after the requirements in
`.ai-coder/escalations/E20-recurring-auto-charge-not-launch-safe-2026-08-24.md`
have approved answers and real behavior tests. Until then, manual payment is the
only supported recurring-payment flow.
