# E61: Change-order expiry retroactively moves approved payment deadlines

**Date:** 2026-09-02

**Status:** OPEN: money-path terms and data design required
**Hard-stop reason:** The Admin expiry setting changes which already-approved
change orders the hourly worker cancels, while the transaction stores no exact
expiry that the customer, provider, or support operator can rely on.

## Bad news first

When a customer approves a change order, the API stores
`status='approved'` and `customer_responded_at=NOW()`. It does not store the
payment deadline that applied at approval. The hourly worker later reads the
current `change_order_approval_expiry_hours` setting and compares every
approved order against that current value.

Lowering the setting can therefore expire an existing approval earlier than
the customer and provider expected. Raising it can keep an existing approval
open longer. An ordinary Admin setting edit silently changes commercial terms
for records that already exist, and neither mobile party nor Booking 360 has an
authoritative per-order timestamp to show support.

No change order, booking, setting value, payment, wallet, migration, or
production data was changed during this audit.

## Evidence

- `packages/api/src/services/booking.service.ts:respondToChangeOrder()` records
  the response timestamp but no expiry timestamp.
- `packages/api/src/services/booking.service.ts:expireApprovedChangeOrders()`
  reads the current setting at worker time and applies it to all approved rows.
- `packages/api/migrations/018_quotes_change_orders.sql` and later change-order
  migrations contain no per-order expiry column.
- `apps/mobile/app/customer/booking/change-order.tsx` can show and pay an
  approved order, but the response does not provide an exact payment deadline.
- The architecture spec's 24-hour non-response support escalation is a
  different pre-approval concept. It does not authorize retroactively changing
  the post-approval payment window.

## Immediate containment

Admin Settings now classifies `change_order_approval_expiry_hours` as
**Launch hold** and removes edit/reset controls in both API truth and the
rendered Admin screen. The stored/default 24-hour value and current worker
behavior are unchanged. This prevents new operator edits while preserving
existing data and avoiding an unapproved money-path migration.

## Recommended permanent design

1. Define one prospective policy for the post-approval payment window.
2. At approval, resolve that policy once and store an exact immutable
   `payment_expires_at` plus policy version on the change order.
3. Make payment finalization and expiry serialize on the same row so only one
   can win at the deadline.
4. Have the worker consume only `payment_expires_at`, never today's setting.
5. Return and display the exact deadline to customer, provider, Booking 360,
   support, notifications, and audit history.
6. Decide explicitly how legacy approved rows receive a deadline before any
   migration or backfill touches real data.
7. Keep provider work unauthorized until additional payment is verified and
   held; `approved` alone must not be represented as paid authorization.

## Required decision

Approve the prospective exact-deadline model and the legacy-row treatment
before this control is made editable or launch-ready. Independent non-money
audit work can continue while E61 remains open.
