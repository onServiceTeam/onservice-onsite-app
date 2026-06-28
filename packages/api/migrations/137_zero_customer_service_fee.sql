-- 137 — Remove the customer service fee, durably (Ken, 2026-06-28).
--
-- The fee was zeroed on the live box with a raw UPDATE, but the committed
-- sources still seeded service_fee_rate='10' / service_fee_min='2500' (mig 050)
-- and the admin Settings validator blocked 0 (min_value=1 / 100). So a fresh DB,
-- a restore-from-baseline, or an admin "reset to default" would re-charge the
-- customer. This migration makes the zero fee the seeded value, the
-- reset-to-default target, AND an admin-settable value.
--
-- Platform revenue is unaffected: it comes from provider commission, not a
-- customer fee. To re-introduce a customer fee later, raise these in admin
-- Settings (min_value is now 0 so any value >= 0 is accepted).

UPDATE platform_settings
   SET value = '0', default_value = '0', min_value = 0
 WHERE key IN ('service_fee_rate', 'service_fee_min');
