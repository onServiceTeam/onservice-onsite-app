-- Migration 153: align the active settings registry with runtime fallbacks.
--
-- Six controls were added to SETTING_DEFAULTS and consumed by services but
-- were never seeded in platform_settings, so they could not actually be
-- operated from the admin panel. Conversely, later migrations added active
-- settings without adding outage fallbacks. The code-side fallback map is
-- aligned in the same release.
--
-- The eight historical `protection` rows describe the legally pulled
-- SiguradoShield product. D04 explicitly says v1.0 has no admin editors for
-- that product. Archive those rows without deleting migration history or
-- changing any booking, payment, claim, customer, or provider data.

UPDATE platform_settings
SET is_active = FALSE,
    description = 'Deferred v1.1+ insurance-product setting. Not available in v1.0; see D04-siguradoshield and LAUNCH-LIMITATIONS section 23.',
    updated_at = NOW()
WHERE category = 'protection'
  AND key IN (
    'max_property_damage_coverage',
    'max_theft_coverage',
    'max_injury_coverage',
    'damage_deductible_threshold',
    'damage_deductible_amount',
    'claim_window_hours',
    'auto_suspend_claim_count',
    'provider_recovery_rate'
  );

INSERT INTO platform_settings
  (category, subcategory, key, label, description, value_type,
   value, default_value, min_value, max_value, unit, display_order,
   is_active)
VALUES
  (
    'marketing', 'channels', 'marketing_channels',
    'Marketing Channels',
    'JSON array of channels accepted by campaign attribution and promo administration.',
    'json',
    '["facebook_ads","google_ads","billboard","kiosk","influencer","sms","email","referral","other"]',
    '["facebook_ads","google_ads","billboard","kiosk","influencer","sms","email","referral","other"]',
    NULL, NULL, NULL, 400, TRUE
  ),
  (
    'matching', 'ranking', 'matching_tier_bonus',
    'Provider Tier Ranking Bonus',
    'JSON object of provider-tier bonuses used by the matching ranking engine.',
    'json',
    '{"founding":0.5,"new":0,"verified":0.25,"pro":0.5,"elite":1}',
    '{"founding":0.5,"new":0,"verified":0.25,"pro":0.5,"elite":1}',
    NULL, NULL, NULL, 400, TRUE
  ),
  (
    'fraud', 'customer_patterns', 'fraud_pattern_dispute_count_threshold',
    'Fraud Pattern Dispute Count',
    'Minimum recent dispute count before customer dispute patterns are evaluated.',
    'integer', '5', '5', 1, 100, 'disputes', 400, TRUE
  ),
  (
    'fraud', 'customer_patterns', 'fraud_pattern_window_days',
    'Fraud Pattern Window',
    'Lookback window used for customer dispute-pattern detection.',
    'integer', '30', '30', 1, 365, 'days', 401, TRUE
  ),
  (
    'fraud', 'customer_patterns', 'fraud_pattern_favor_provider_rate',
    'Fraud Pattern Provider-Favor Rate',
    'Fraction of resolved disputes favoring providers that triggers a customer fraud-pattern flag.',
    'number', '0.80', '0.80', 0, 1, 'ratio', 402, TRUE
  ),
  (
    'disputes', 'no_show', 'noshow_auto_resolve_window_minutes',
    'No-Show Auto-Resolve Window',
    'Maximum scheduled-to-completed interval used by the no-show auto-resolution rule.',
    'integer', '30', '30', 1, 1440, 'minutes', 400, TRUE
  )
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  default_value = EXCLUDED.default_value,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  unit = EXCLUDED.unit,
  display_order = EXCLUDED.display_order,
  is_active = TRUE;
