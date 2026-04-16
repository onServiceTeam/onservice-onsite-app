-- Add 'paid' status to change_orders for idempotent payment finalization
-- After payment is processed, the change order moves from 'approved' to 'paid'
-- preventing double-finalization of booking amounts

ALTER TABLE change_orders DROP CONSTRAINT IF EXISTS change_orders_status_check;
ALTER TABLE change_orders ADD CONSTRAINT change_orders_status_check
    CHECK (status IN ('pending', 'approved', 'declined', 'paid'));
