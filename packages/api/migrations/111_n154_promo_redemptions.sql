-- 111_n154_promo_redemptions.sql
--
-- MED-N154 fix — per-customer promo usage tracking.
-- Pre-fix: promo_codes.usage_limit_per_customer existed and the admin
-- UI accepted the value, but the resolver silently ignored it (no
-- per-user usage table). A customer could apply the same promo to
-- N bookings as long as usage_limit_total allowed.
-- Post-fix: this table records every promo redemption; the resolver
-- counts rows per (promo_code_id, customer_id) and rejects when the
-- count >= usage_limit_per_customer.
--
-- Defensive shape:
--   - UNIQUE (booking_id, promo_code_id) — same booking can't be
--     double-recorded for the same promo (booking creation transaction
--     uses ON CONFLICT DO NOTHING so re-runs are idempotent).
--   - Index on (promo_code_id, customer_id) for the hot resolver path.
--   - ON DELETE CASCADE on promo_codes so deleting a promo cleans up
--     its redemption history.

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discount_centavos BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_redemptions_unique_booking_promo UNIQUE (booking_id, promo_code_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_customer
  ON promo_redemptions (promo_code_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_customer
  ON promo_redemptions (customer_id, created_at DESC);
