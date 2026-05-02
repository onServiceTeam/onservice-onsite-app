-- 112_n70_change_order_expiry_settings.sql
--
-- MED-N70 fix — admin-tunable expiry window for the change-order
-- auto-expire worker (booking.service.expireApprovedChangeOrders).
--
-- Pre-fix: respondToChangeOrder(approved=TRUE) committed the status
-- update and exited with paymentRequired=true. If the customer never
-- called finalizeChangeOrderPayment (closed app, lost network), the
-- change_order sat in 'approved' state forever. The provider could
-- (mis)read this as authorization to do additional work that was
-- never paid for.
--
-- Post-fix: a cron worker runs hourly and flips approved change_orders
-- older than this window to 'expired'. The window defaults to 24h
-- but is admin-tunable here so support can shorten/lengthen it
-- without a code deploy. Both customer and provider get a notification.
--
-- Setting:
--   change_order_expiry_hours :: integer (default 24)

-- CRIT-PHASE16-02i fix — original INSERT omitted required columns.
INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, min_value, max_value, unit, display_order, updated_at)
VALUES (
  'booking',
  'change_order_approval_expiry_hours',
  'Change Order Approval Expiry',
  'MED-N70 — hours after a customer-approved change order before the auto-expire worker flips it to status=expired.',
  'integer',
  '24',
  '24',
  1,
  168,
  'hours',
  100,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
