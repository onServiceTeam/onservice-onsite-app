const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  SETTING_DEFAULTS,
  checkSettingsDriftAtBoot,
} from '../src/services/settings.service';

// Independent snapshot of the active registry after migration 188 (188 added
// invited_testers_only, invited_testers_message, referral_program_enabled
// and suki_program_enabled for the customer review slice P2, D41; 182 added
// request_first_booking for D38; D38 Milestone 2 added seven request keys in
// 183, six job-media keys in 184 and request_threads_enabled in 185; D38
// Milestone 3 added the three ops_* alert and coverage keys in 186; the list
// was last refreshed at 166). Do not derive this from SETTING_DEFAULTS: the
// test must fail when either side gains or loses a key without the
// corresponding database/code change.
const ACTIVE_DATABASE_SETTING_KEYS = [
  'commission_rate_founding',
  'commission_rate_new',
  'commission_rate_verified',
  'commission_rate_pro',
  'commission_rate_elite',
  'service_fee_rate',
  'service_fee_min',
  'service_fee_max',
  'guarantee_fund_rate',
  'vat_rate',
  'tip_max_amount_cents',
  'addon_price_max_cents',
  'escrow_auto_confirm_hours',
  'escrow_dispute_window_hours',
  'minimum_payment_amount',
  'minimum_withdrawal_amount',
  'withdrawal_processing_days',
  'surge_multiplier_min',
  'surge_multiplier_max',
  'reconciliation_alert_threshold_centavos',
  'aml_large_transaction_threshold_centavos',
  'feature_flag.promo_redemption_enabled',
  'feature_flag.ab_testing_enabled',
  'feature_flag.business_contract_booking_enabled',
  'marketing_channels',
  'matching_tier_bonus',
  'fraud_pattern_dispute_count_threshold',
  'fraud_pattern_window_days',
  'fraud_pattern_favor_provider_rate',
  'noshow_auto_resolve_window_minutes',
  'bir_filer_company_name',
  'bir_filer_tin',
  'bir_filer_address',
  'bir_filer_ptu_number',
  'bir_filer_vat_status',
  'cancel_refund_over_24h',
  'cancel_refund_2_to_24h',
  'cancel_refund_1_to_2h',
  'cancel_refund_30min_to_1h',
  'cancel_refund_under_30min',
  'cancel_refund_provider_arrived',
  'cancel_refund_customer_noshow',
  'otp_length',
  'otp_expiry_minutes',
  'otp_max_attempts',
  'otp_cooldown_seconds',
  'auth_rate_limit_window_ms',
  'auth_rate_limit_max_requests',
  'upload_rate_limit_window_ms',
  'upload_rate_limit_max_requests',
  'jwt_access_expires',
  'jwt_refresh_expires',
  'admin_session_timeout_hours',
  'invited_testers_only',
  'invited_testers_message',
  'provider_noshow_minutes',
  'nbi_expiry_warning_days',
  'max_service_radius_km',
  'quote_expiry_hours',
  'max_quotes_per_booking',
  'request_first_booking',
  'request_max_open_quotes',
  'request_max_rounds',
  'request_max_invites',
  'request_show_declined_amount',
  'request_provider_poll_seconds',
  'request_customer_still_looking_minutes',
  'request_slot_lead_minutes',
  'request_threads_enabled',
  'change_order_approval_expiry_hours',
  'matching_min_rating',
  'matching_min_rating_reviews',
  'recurring_auto_charge_max_consecutive_failures',
  'rate_limit_window_ms',
  'rate_limit_max_requests',
  'suspicious_ip_threshold',
  'captcha_threshold',
  'refresh_token_strict_fingerprint',
  'allowed_image_mime_types',
  'job_media_max_photos',
  'job_media_photo_max_bytes',
  'job_media_video_max_seconds',
  'job_media_video_max_bytes',
  'job_media_voice_max_seconds',
  'job_media_voice_max_bytes',
  'business_account_types',
  'business_payment_terms',
  'suki_tiers',
  'suki_points_to_peso_rate',
  'suki_program_enabled',
  'referral_program_enabled',
  'brand_color_primary',
  'brand_color_secondary',
  'brand_color_accent',
  'map_tile_url',
  'map_tile_attribution',
  'map_tile_api_key',
  'auto_dispatch_enabled',
  'ops_request_alert_amber_minutes',
  'ops_request_alert_red_minutes',
  'ops_coverage_min_responsive_providers',
  'cache_ttl_categories',
  'cache_ttl_provider_profile',
  'cache_ttl_search_results',
] as const;

describe('active platform-setting outage fallbacks', () => {
  it('Bug UX198 — every active database setting can be resolved from the fallback registry', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: ACTIVE_DATABASE_SETTING_KEYS.map((key) => ({ key })),
    });

    await expect(checkSettingsDriftAtBoot()).resolves.toEqual({
      defaultsOnly: [],
      dbOnly: [],
      matched: ACTIVE_DATABASE_SETTING_KEYS.length,
    });
    expect(Object.keys(SETTING_DEFAULTS).sort()).toEqual(
      [...ACTIVE_DATABASE_SETTING_KEYS].sort(),
    );
    expect(dbQueryMock).toHaveBeenCalledWith(
      expect.stringMatching(/FROM platform_settings WHERE is_active = TRUE/),
    );
  });
});
