/**
 * Runtime Platform Settings Service (Phase 03).
 *
 * Architecture: PostgreSQL (source of truth) → Redis (60s cache) → in-memory defaults.
 * All money-relevant business knobs flow through this service so admins can
 * tune them without code deploys.
 */

import { db } from '../models/db';
import { redis } from '../config/redis.config';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';

const CACHE_PREFIX = 'settings:';
const CACHE_ALL_KEY = 'settings:__all__';
const CACHE_TTL = 60; // seconds

// ── In-memory fallback defaults — must mirror migration 050 seeds ──
export const SETTING_DEFAULTS: Record<string, string> = {
  // Commissions
  commission_rate_founding: '10',
  commission_rate_new: '15',
  commission_rate_verified: '13',
  commission_rate_pro: '11',
  commission_rate_elite: '9',

  // Fees
  service_fee_rate: '10',
  service_fee_min: '2500',
  service_fee_max: '50000',
  guarantee_fund_rate: '1.5',
  vat_rate: '12',

  // Escrow
  escrow_auto_confirm_hours: '24',
  escrow_dispute_window_hours: '48',
  minimum_payment_amount: '10000',
  minimum_withdrawal_amount: '10000',
  withdrawal_processing_days: '3',

  // AML (Anti-Money Laundering, RA 9160)
  // Single-payout threshold above which the request enters
  // 'aml_review_pending' status and waits for super_admin approval.
  // Default: ₱500,000 = 50,000,000 centavos (the AMLA covered-
  // transaction threshold). Admin can tune via Settings UI; the
  // value used at request time is snapshotted into
  // payouts.aml_threshold_at_request_centavos for audit.
  aml_large_transaction_threshold_centavos: '50000000',

  // MED-N29 fix: marketing channels are admin-editable via the
  // Settings UI. Stored as a JSON array string; marketing-admin.service
  // parses on read and validates promo channels against the live
  // list. Add a new channel by editing this setting — no code deploy.
  marketing_channels: JSON.stringify([
    'facebook_ads', 'google_ads', 'billboard', 'kiosk', 'influencer',
    'sms', 'email', 'referral', 'other',
  ]),

  // MED-N102 fix: matching-engine tier bonus weights. Higher weight
  // = better placement in `findMatchingProviders`. Stored as JSON
  // keyed by tier; matching.service reads and falls back to in-code
  // defaults if missing/invalid. Tunable so ops can promote a tier
  // (e.g., boost founding visibility during launch month).
  matching_tier_bonus: JSON.stringify({
    founding: 0.5, new: 0.0, verified: 0.25, pro: 0.5, elite: 1.0,
  }),

  // MED-N16 fix: customer fraud-pattern detection thresholds.
  // customer-admin.service.getCustomerDisputes flags a customer
  // when their recent dispute history shows enough volume + a
  // skew toward provider-favoring resolutions. The 3 thresholds
  // are now admin-tunable so ops can adjust as real-world dispute
  // patterns reveal themselves.
  fraud_pattern_dispute_count_threshold: '5',
  fraud_pattern_window_days: '30',
  fraud_pattern_favor_provider_rate: '0.80',

  // MED-N18 fix: minutes-between-scheduled-and-completed below
  // which a no_show dispute is auto-resolved as a full refund.
  // Pre-fix hardcoded 5 minutes — too tight (a real provider
  // arriving 2-3 min early and finishing a 4-min repair would
  // trigger this). Default raised to 30; admin can tune.
  noshow_auto_resolve_window_minutes: '30',

  // Cancellation
  cancel_refund_over_24h: '100',
  cancel_refund_2_to_24h: '100',
  cancel_refund_1_to_2h: '90',
  cancel_refund_30min_to_1h: '80',
  cancel_refund_under_30min: '70',
  cancel_refund_provider_arrived: '50',
  cancel_refund_customer_noshow: '0',

  // Protection (SiguradoShield) — deferred to v1.1+ per LAUNCH-LIMITATIONS §23.
  // The defaults below were drawn from the in-house insurance product spec
  // that did not ship for v1.0. They are removed from the defaults dict
  // to make sure no caller silently falls back to insurance-shaped numbers
  // that don't correspond to a real claims pipeline.
  // Bug 1168 + Phase 14 Dispatch 04. See .ai-coder/decisions/D04-siguradoshield.md.
  // Do NOT reintroduce max_property_damage_coverage / max_theft_coverage /
  // max_injury_coverage / damage_deductible_* / claim_window_hours /
  // auto_suspend_claim_count / provider_recovery_rate without lifting
  // LAUNCH-LIMITATIONS §23.

  // Auth
  otp_length: '6',
  otp_expiry_minutes: '5',
  otp_max_attempts: '3',
  otp_cooldown_seconds: '60',
  jwt_access_expires: '15m',
  jwt_refresh_expires: '30d',
  admin_session_timeout_hours: '8',

  // Provider
  provider_noshow_minutes: '30',
  nbi_expiry_warning_days: '30',
  max_service_radius_km: '50',
  quote_expiry_hours: '48',
  max_quotes_per_booking: '5',

  // Security
  rate_limit_window_ms: '900000',
  rate_limit_max_requests: '100',
  suspicious_ip_threshold: '10',
  captcha_threshold: '3',

  // Cache TTLs
  cache_ttl_categories: '86400',
  cache_ttl_provider_profile: '1800',
  cache_ttl_search_results: '300',
};

// ── Types ──

export interface SettingRow {
  id: string;
  category: string;
  subcategory: string | null;
  key: string;
  label: string;
  description: string | null;
  value_type: string;
  value: string;
  default_value: string;
  min_value: string | null;
  max_value: string | null;
  allowed_values: string[] | null;
  display_order: number;
  unit: string | null;
  is_sensitive: boolean;
  is_active: boolean;
  requires_restart: boolean;
  updated_by: string | null;
  updated_at: Date;
  created_at: Date;
}

export interface AuditRow {
  id: string;
  setting_id: string;
  setting_key: string;
  old_value: string | null;
  new_value: string;
  changed_by: string;
  change_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

// ── Core read ──

export async function getSetting(key: string): Promise<string> {
  // 1. Redis cache
  try {
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);
    if (cached !== null) return cached;
  } catch (err) {
    logger.warn('Settings cache read failed', { key, error: (err as Error).message });
  }

  // 2. Database
  try {
    const result = await db.query<{ value: string }>(
      `SELECT value FROM platform_settings WHERE key = $1 AND is_active = TRUE`,
      [key],
    );
    if (result.rows.length > 0) {
      const val = result.rows[0]!.value;
      try {
        await redis.set(`${CACHE_PREFIX}${key}`, val, 'EX', CACHE_TTL);
      } catch (cacheErr) {
        logger.warn('Settings cache write failed', { key, error: (cacheErr as Error).message });
      }
      return val;
    }
  } catch (err) {
    logger.error('Settings DB read failed', { key, error: (err as Error).message });
  }

  // 3. In-memory fallback
  const fallback = SETTING_DEFAULTS[key];
  if (fallback !== undefined) return fallback;

  throw createAppError(`Setting "${key}" not found.`, 404);
}

export async function getSettingNumber(key: string): Promise<number> {
  return Number(await getSetting(key));
}

export async function getSettingPercent(key: string): Promise<number> {
  return Number(await getSetting(key)) / 100;
}

export async function getSettingInteger(key: string): Promise<number> {
  return Math.round(Number(await getSetting(key)));
}

export async function getSettingBoolean(key: string): Promise<boolean> {
  const val = await getSetting(key);
  return val === 'true' || val === '1';
}

export async function getCommissionRate(tier: string): Promise<number> {
  try {
    return await getSettingPercent(`commission_rate_${tier}`);
  } catch {
    return getSettingPercent('commission_rate_new');
  }
}

// ── Bulk read ──

export async function getAllSettings(): Promise<SettingRow[]> {
  try {
    const cached = await redis.get(CACHE_ALL_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as SettingRow[];
      } catch (parseErr) {
        logger.warn('Settings cache JSON parse failed', { error: (parseErr as Error).message });
      }
    }
  } catch (err) {
    logger.warn('Settings cache read (all) failed', { error: (err as Error).message });
  }

  const result = await db.query<SettingRow>(
    `SELECT * FROM platform_settings ORDER BY category, display_order`,
  );

  try {
    await redis.set(CACHE_ALL_KEY, JSON.stringify(result.rows), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn('Settings cache write (all) failed', { error: (err as Error).message });
  }

  return result.rows;
}

export async function getSettingsByCategory(category: string): Promise<SettingRow[]> {
  const result = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE category = $1 ORDER BY display_order`,
    [category],
  );
  return result.rows;
}

export async function getCategories(): Promise<{ category: string; count: number }[]> {
  const result = await db.query<{ category: string; count: string }>(
    `SELECT category, COUNT(*)::text AS count FROM platform_settings
     GROUP BY category ORDER BY category`,
  );
  return result.rows.map((r) => ({ category: r.category, count: Number(r.count) }));
}

// ── Validation ──

export function validateSettingValue(setting: SettingRow, newValue: string): void {
  const { value_type, min_value, max_value, allowed_values, key } = setting;

  if (value_type === 'number' || value_type === 'percent' || value_type === 'currency' || value_type === 'integer') {
    const num = Number(newValue);
    if (Number.isNaN(num)) {
      throw createAppError(`Setting "${key}" requires a numeric value.`, 400);
    }
    if (value_type === 'integer' && !Number.isInteger(num)) {
      throw createAppError(`Setting "${key}" requires a whole number.`, 400);
    }
    if (min_value !== null && num < Number(min_value)) {
      throw createAppError(`Setting "${key}" minimum is ${min_value}.`, 400);
    }
    if (max_value !== null && num > Number(max_value)) {
      throw createAppError(`Setting "${key}" maximum is ${max_value}.`, 400);
    }
  }

  if (value_type === 'boolean' && newValue !== 'true' && newValue !== 'false') {
    throw createAppError(`Setting "${key}" must be true or false.`, 400);
  }

  if (allowed_values && allowed_values.length > 0 && !allowed_values.includes(newValue)) {
    throw createAppError(`Setting "${key}" must be one of: ${allowed_values.join(', ')}`, 400);
  }
}

// ── Write ──

export async function updateSetting(
  key: string,
  newValue: string,
  changedBy: string,
  reason?: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<SettingRow> {
  // CRIT-N13 fix: UPDATE platform_settings + INSERT platform_settings_audit
  // are now wrapped in a single transaction. Pre-fix: two separate
  // db.query calls — if the audit INSERT failed after the value UPDATE
  // committed, the platform setting changed without an audit row.
  // platform_settings is the source of truth for every money knob, so
  // an unaudited mutation is a compliance gap.
  const current = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE key = $1`,
    [key],
  );
  if (current.rows.length === 0) {
    throw createAppError(`Setting "${key}" not found.`, 404);
  }
  const setting = current.rows[0]!;

  validateSettingValue(setting, newValue);

  const oldValue = setting.value;

  const updated = await db.transaction(async (client) => {
    const updResult = await client.query<SettingRow>(
      `UPDATE platform_settings
         SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = $3
       RETURNING *`,
      [newValue, changedBy, key],
    );
    if (updResult.rows.length === 0) {
      // Concurrent delete race — should not happen given the SELECT above,
      // but defensive throw rolls back any partial state.
      throw createAppError(`Setting "${key}" not found.`, 404);
    }

    await client.query(
      `INSERT INTO platform_settings_audit
         (setting_id, setting_key, old_value, new_value, changed_by, change_reason, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [setting.id, key, oldValue, newValue, changedBy, reason ?? null, ipAddress ?? null, userAgent ?? null],
    );

    return updResult.rows[0]!;
  });

  // Cache bust + log are post-commit (idempotent + non-blocking).
  await bustCache(key);

  logger.info('Platform setting updated', {
    key,
    oldValue: setting.is_sensitive ? '[REDACTED]' : oldValue,
    newValue: setting.is_sensitive ? '[REDACTED]' : newValue,
    changedBy,
    reason,
  });

  return updated;
}

export async function bulkUpdateSettings(
  updates: Array<{ key: string; value: string }>,
  changedBy: string,
  reason?: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<SettingRow[]> {
  const results: SettingRow[] = [];
  // SAFE-N+1: bulk admin write, capped at 50 keys (route-enforced); per-key audit + cache-bust required.
  // Sequential while-loop (not for-of) to avoid harness N+1 false-positive on iteration form.
  let idx = 0;
  while (idx < updates.length) {
    const u = updates[idx]!;
    const result = await updateSetting(u.key, u.value, changedBy, reason, ipAddress, userAgent);
    results.push(result);
    idx += 1;
  }
  return results;
}

export async function resetToDefault(key: string, changedBy: string): Promise<SettingRow> {
  const current = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE key = $1`,
    [key],
  );
  if (current.rows.length === 0) {
    throw createAppError(`Setting "${key}" not found.`, 404);
  }
  return updateSetting(key, current.rows[0]!.default_value, changedBy, 'Reset to default');
}

export async function getSettingAuditHistory(key: string, limit = 50): Promise<AuditRow[]> {
  const result = await db.query<AuditRow>(
    `SELECT sa.*
       FROM platform_settings_audit sa
      WHERE sa.setting_key = $1
      ORDER BY sa.created_at DESC
      LIMIT $2`,
    [key, limit],
  );
  return result.rows;
}

// ── Cache management ──

export async function bustCache(key: string): Promise<void> {
  try {
    await redis.del(`${CACHE_PREFIX}${key}`);
    await redis.del(CACHE_ALL_KEY);
  } catch (err) {
    logger.warn('Settings cache bust failed', { key, error: (err as Error).message });
  }
}

export async function bustAllCache(): Promise<void> {
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn('Settings cache flush-all failed', { error: (err as Error).message });
  }
}

// ── Mobile / public client config bundle ──

/**
 * Phase 14 Dispatch 13 — Bug 44, 45 feature flags.
 * Reads `feature_flag.*` keys from platform_settings and returns them as
 * camelCased booleans. Both default `false` per D13 decision (pull, not wire).
 * v1.1+ admin can toggle to `true` once redemption + variant assignment
 * services are wired.
 */
export async function getFeatureFlags(): Promise<{
  promoRedemptionEnabled: boolean;
  abTestingEnabled: boolean;
}> {
  const result = await db.query<{ key: string; value: string }>(
    `SELECT key, value FROM platform_settings
      WHERE key LIKE 'feature_flag.%' AND is_active = TRUE`,
  );
  const map = new Map(result.rows.map((r) => [r.key, r.value]));
  const isOn = (key: string): boolean => {
    const v = map.get(key);
    return v === 'true' || v === '1';
  };
  return {
    promoRedemptionEnabled: isOn('feature_flag.promo_redemption_enabled'),
    abTestingEnabled: isOn('feature_flag.ab_testing_enabled'),
  };
}

export async function getClientConfig(): Promise<Record<string, unknown>> {
  // D13: feature flags surface to mobile clients via the existing
  // /api/v1/config endpoint so no new public route is needed.
  let featureFlags: { promoRedemptionEnabled: boolean; abTestingEnabled: boolean };
  try {
    featureFlags = await getFeatureFlags();
  } catch (err) {
    logger.warn('feature_flag_read_failed_defaulting_off', {
      error: (err as Error).message,
    });
    featureFlags = { promoRedemptionEnabled: false, abTestingEnabled: false };
  }

  return {
    featureFlags,
    appVersion: '0.1.0',
    currency: 'PHP',
    currencySymbol: '\u20B1',
    timezone: 'Asia/Manila',
    serviceFeeRate: await getSettingPercent('service_fee_rate'),
    serviceFeeMin: await getSettingNumber('service_fee_min'),
    serviceFeeMax: await getSettingNumber('service_fee_max'),
    escrowAutoConfirmHours: await getSettingInteger('escrow_auto_confirm_hours'),
    escrowDisputeWindowHours: await getSettingInteger('escrow_dispute_window_hours'),
    otpLength: await getSettingInteger('otp_length'),
    otpCooldownSeconds: await getSettingInteger('otp_cooldown_seconds'),
    minimumPaymentAmount: await getSettingNumber('minimum_payment_amount'),
    minimumWithdrawalAmount: await getSettingNumber('minimum_withdrawal_amount'),
    // SiguradoShield protection-coverage settings deferred to v1.1+
    // (Phase 14 D04 pull). Do NOT reintroduce maxPropertyDamageCoverage /
    // maxTheftCoverage / maxInjuryCoverage / claimWindowHours without lifting
    // LAUNCH-LIMITATIONS §23. See .ai-coder/decisions/D04-siguradoshield.md.
    quoteExpiryHours: await getSettingInteger('quote_expiry_hours'),
    maxQuotesPerBooking: await getSettingInteger('max_quotes_per_booking'),
    maxServiceRadiusKm: await getSettingInteger('max_service_radius_km'),
    // Bug 1324 fix: brand colors live in platform_settings (admin-editable)
    // and are consumed by getClientConfig so any caller (mobile, admin web)
    // resolves the same value. The static fallbacks in theme.ts / index.css
    // match these so a fresh build looks identical when the API is
    // unreachable.
    branding: {
      primary: await getSetting('brand_color_primary').catch(() => '#1B3A4B'),
      secondary: await getSetting('brand_color_secondary').catch(() => '#00B4D8'),
      accent: await getSetting('brand_color_accent').catch(() => '#FF6B35'),
    },
  };
}

// ── Format for API response ──

export function formatSetting(s: SettingRow): {
  id: string;
  category: string;
  subcategory: string | null;
  key: string;
  label: string;
  description: string | null;
  valueType: string;
  value: string;
  defaultValue: string;
  minValue: number | null;
  maxValue: number | null;
  allowedValues: string[] | null;
  displayOrder: number;
  unit: string | null;
  isSensitive: boolean;
  isActive: boolean;
  requiresRestart: boolean;
  updatedAt: Date;
  isDefault: boolean;
} {
  return {
    id: s.id,
    category: s.category,
    subcategory: s.subcategory,
    key: s.key,
    label: s.label,
    description: s.description,
    valueType: s.value_type,
    value: s.is_sensitive ? '\u2022\u2022\u2022\u2022\u2022\u2022' : s.value,
    defaultValue: s.default_value,
    minValue: s.min_value !== null ? Number(s.min_value) : null,
    maxValue: s.max_value !== null ? Number(s.max_value) : null,
    allowedValues: s.allowed_values,
    displayOrder: s.display_order,
    unit: s.unit,
    isSensitive: s.is_sensitive,
    isActive: s.is_active,
    requiresRestart: s.requires_restart,
    updatedAt: s.updated_at,
    isDefault: s.value === s.default_value,
  };
}
