-- Migration 139 — add 'expired' to change_orders.status (schema-drift fix).
--
-- MONEY/SAFETY: the MED-N70 auto-expire worker
-- (booking.service.ts expireApprovedChangeOrders, cron-registered in
-- jobs/workers.ts) runs `UPDATE change_orders SET status = 'expired'` for
-- customer-approved-but-unpaid change orders older than the configured window.
-- But the live CHECK constraint (set by migration 036) only allows
-- (pending, approved, declined, paid) — 'expired' was never added. So the
-- worker's UPDATE throws Postgres 23514 (check_violation) on every run that has
-- an eligible row, the change order is NEVER cancelled, and it stays 'approved'.
-- That defeats the exact safety MED-N70 was built for: a provider could read
-- 'approved' as authorization for work the customer never paid for.
--
-- booking_quotes already allows 'expired' (migration 018); this brings
-- change_orders in line. No approved change orders exist on prod yet, so this is
-- pre-emptive, but the worker would start throwing the first time one is.

ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS change_orders_status_check;
ALTER TABLE change_orders ADD CONSTRAINT change_orders_status_check
    CHECK (status IN ('pending', 'approved', 'declined', 'paid', 'expired'));
