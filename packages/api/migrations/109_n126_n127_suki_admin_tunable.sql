-- 109_n126_n127_suki_admin_tunable.sql
--
-- MED-N126 + MED-N127 — make the SUKI loyalty program admin-tunable.
-- Pre-fix: tier definitions and the redemption rate were hardcoded
-- in platformConfig.sukiTiers / sukiPointsRedemptionRate. Admins
-- couldn't tune the program without a code deploy.
--
-- Two new platform_settings rows:
--   - suki_tiers (JSON-encoded map of tier name → {minBookings,
--     pointsPerPeso, discount}). Defaults match the prior in-code
--     constants.
--   - suki_points_to_peso_rate (number). MED-N127 — pre-fix the
--     redemption code used `amountCredited = points` (1 point = ₱1,
--     100% cashback at base tier, 300% at super_suki). Post-fix
--     amountCredited = points / suki_points_to_peso_rate. Default
--     100 → 100 points = ₱1 (1% cashback at base tier, 3% at super_suki).
--
-- Operationally the suki.service falls back to the platformConfig
-- defaults if either setting is missing or unparseable, so this
-- migration is non-blocking.

-- CRIT-PHASE16-02g fix — original INSERTs omitted category, label,
-- value_type, default_value (all NOT NULL since mig 050).
INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, display_order)
  VALUES (
    'loyalty',
    'suki_tiers',
    'Suki Loyalty Tiers',
    'JSON map of suki loyalty tiers. Each tier has minBookings (threshold to reach the tier), pointsPerPeso (multiplier when earning), and discount (percent off bookings at this tier).',
    'json',
    '{"new":{"minBookings":0,"pointsPerPeso":1,"discount":0},"regular":{"minBookings":3,"pointsPerPeso":1,"discount":0},"suki":{"minBookings":10,"pointsPerPeso":2,"discount":5},"super_suki":{"minBookings":25,"pointsPerPeso":3,"discount":10}}',
    '{"new":{"minBookings":0,"pointsPerPeso":1,"discount":0},"regular":{"minBookings":3,"pointsPerPeso":1,"discount":0},"suki":{"minBookings":10,"pointsPerPeso":2,"discount":5},"super_suki":{"minBookings":25,"pointsPerPeso":3,"discount":10}}',
    100
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, min_value, max_value, display_order)
  VALUES (
    'loyalty',
    'suki_points_to_peso_rate',
    'Suki Points → Peso Rate',
    'MED-N127. Suki points → wallet credit conversion rate. amountCredited = points / this rate. Default 100 means 100 points = ₱1 wallet credit (1% cashback at base tier).',
    'integer',
    '100',
    '100',
    1,
    10000,
    101
  )
ON CONFLICT (key) DO NOTHING;
