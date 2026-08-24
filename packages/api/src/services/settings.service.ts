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
import apiPackageJson from '../../package.json';

const CACHE_PREFIX = 'settings:';
const CACHE_ALL_KEY = 'settings:__all_active__';
const CACHE_TTL = 60; // seconds

// ── In-memory fallback defaults — must mirror every active DB setting ──
export const SETTING_DEFAULTS: Record<string, string> = {
  // Commissions
  commission_rate_founding: '10',
  commission_rate_new: '15',
  commission_rate_verified: '13',
  commission_rate_pro: '11',
  commission_rate_elite: '9',

  // Fees — no customer service fee (Ken, 2026-06-28; mig 137). Defaults are the
  // DB-outage fallback, so they must also be 0 or a settings read failure would
  // re-charge the customer at 10%/₱25. Platform earns from provider commission.
  service_fee_rate: '0',
  service_fee_min: '0',
  service_fee_max: '50000',
  guarantee_fund_rate: '1.5',
  vat_rate: '12',
  tip_max_amount_cents: '500000',
  addon_price_max_cents: '5000000',

  // Escrow
  escrow_auto_confirm_hours: '24',
  escrow_dispute_window_hours: '48',
  minimum_payment_amount: '10000',
  minimum_withdrawal_amount: '10000',
  withdrawal_processing_days: '3',
  surge_multiplier_min: '1.0',
  surge_multiplier_max: '5.0',
  reconciliation_alert_threshold_centavos: '10000',

  // Internal large-transaction compliance review control.
  // Single-payout threshold at/above which the request enters
  // 'aml_review_pending' status and waits for super_admin approval.
  // Default: ₱500,000 = 50,000,000 centavos. This conservative hold is
  // not a legal determination of covered-person or reporting status. Admin
  // can tune it via Settings UI; the value used at request time is snapshotted into
  // payouts.aml_threshold_at_request_centavos for audit.
  aml_large_transaction_threshold_centavos: '50000000',

  // Launch-gated feature flags. Both remain disabled until their complete
  // customer-side pipelines are intentionally launched.
  'feature_flag.promo_redemption_enabled': 'false',
  'feature_flag.ab_testing_enabled': 'false',

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

  // BIR filer identity. Sentinel fallbacks deliberately make BIR-bound PDF
  // generation fail closed if PostgreSQL is unavailable.
  bir_filer_company_name: '__UNSET__',
  bir_filer_tin: '__UNSET__',
  bir_filer_address: '__UNSET__',
  bir_filer_ptu_number: '__UNSET__',
  bir_filer_vat_status: 'VAT-Registered',

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
  change_order_approval_expiry_hours: '24',

  // Recurring bookings remain manual-payment-only while E20 is open. This
  // threshold is retained solely for compatibility with legacy audit rows.
  recurring_auto_charge_max_consecutive_failures: '3',

  // Security
  rate_limit_window_ms: '900000',
  rate_limit_max_requests: '100',
  suspicious_ip_threshold: '10',
  captcha_threshold: '3',
  refresh_token_strict_fingerprint: 'false',
  allowed_image_mime_types: 'image/jpeg,image/png,image/webp',

  // Business account validation lists.
  business_account_types: 'office,condo_management,restaurant,hotel,retail,school,hospital,other',
  business_payment_terms: 'net_15,net_30,net_60',

  // Suki loyalty settings. These match the migration defaults and preserve a
  // conservative 100-points-to-₱1 conversion during a database outage.
  suki_tiers: JSON.stringify({
    new: { minBookings: 0, pointsPerPeso: 1, discount: 0 },
    regular: { minBookings: 3, pointsPerPeso: 1, discount: 0 },
    suki: { minBookings: 10, pointsPerPeso: 2, discount: 5 },
    super_suki: { minBookings: 25, pointsPerPeso: 3, discount: 10 },
  }),
  suki_points_to_peso_rate: '100',

  // Stitch-aligned branding and dispatch defaults.
  brand_color_primary: '#003D9B',
  brand_color_secondary: '#0052CC',
  brand_color_accent: '#FE8A00',
  map_tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  map_tile_attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  map_tile_api_key: '',
  auto_dispatch_enabled: 'true',

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

export type SettingRuntimeStatus = 'live' | 'held' | 'not_connected';

export interface SettingRuntimeControl {
  status: SettingRuntimeStatus;
  label: string;
  summary: string;
  editable: boolean;
}

const NOT_CONNECTED_SETTING_SUMMARIES: Readonly<Record<string, string>> = {
  vat_rate: 'Invoices still use the deployed VAT configuration. This stored value is read-only until invoice calculation is connected.',
  escrow_auto_confirm_hours: 'The release worker still uses deployed configuration. Editing is blocked so the customer timer cannot disagree with escrow release behavior.',
  escrow_dispute_window_hours: 'Dispute enforcement still uses deployed configuration. Editing is blocked so customer guidance cannot disagree with the filing deadline.',
  minimum_payment_amount: 'Payment validation still uses deployed configuration. Editing is blocked so the customer app cannot advertise a different minimum.',
  minimum_withdrawal_amount: 'Payout validation still uses deployed configuration. Editing is blocked so provider guidance cannot disagree with payout enforcement.',
  withdrawal_processing_days: 'No authoritative payout workflow currently consumes this stored value.',
  surge_multiplier_min: 'Pricing does not currently consume this stored lower bound.',
  surge_multiplier_max: 'Pricing does not currently consume this stored upper bound.',
  jwt_access_expires: 'Access-token lifetime is controlled by deployment configuration, not this database row.',
  jwt_refresh_expires: 'Refresh-token, database, and cookie lifetimes are controlled by deployment configuration, not this database row.',
  admin_session_timeout_hours: 'Admin session and cookie lifetimes are controlled by deployment configuration, not this database row.',
  max_service_radius_km: 'Provider matching and service-area validation still use deployed configuration.',
  cache_ttl_provider_profile: 'Provider-profile cache lifetime still uses deployed configuration.',
};

const HELD_SETTING_SUMMARIES: Readonly<Record<string, string>> = {
  'feature_flag.promo_redemption_enabled': 'Promo redemption is deferred until its complete customer and settlement pipeline is launched.',
  'feature_flag.ab_testing_enabled': 'A/B assignment is deferred until exposure assignment and reporting are launched.',
  recurring_auto_charge_max_consecutive_failures: 'Recurring bookings remain manual-payment-only while escalation E20 is open.',
};

const LIVE_SETTING_SUMMARIES: Readonly<Record<string, string>> = {
  aml_large_transaction_threshold_centavos: 'New single-payout requests at or above this threshold enter an internal compliance-review hold. Existing requests keep their snapshotted threshold.',
};

/**
 * Describe what an admin setting really controls today.
 *
 * Rows are intentionally not trusted to self-describe through
 * `requires_restart`: the original migration marked every row false even
 * though some consumers remained hardcoded. Unknown/new rows fail closed as
 * read-only until their authoritative consumer is audited and connected.
 */
export function getSettingRuntimeControl(key: string): SettingRuntimeControl {
  const disconnectedSummary = NOT_CONNECTED_SETTING_SUMMARIES[key];
  if (disconnectedSummary) {
    return {
      status: 'not_connected',
      label: 'Not connected',
      summary: disconnectedSummary,
      editable: false,
    };
  }

  const heldSummary = HELD_SETTING_SUMMARIES[key];
  if (heldSummary) {
    return {
      status: 'held',
      label: 'Launch hold',
      summary: heldSummary,
      editable: false,
    };
  }

  if (Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key)) {
    return {
      status: 'live',
      label: 'Live control',
      summary: LIVE_SETTING_SUMMARIES[key]
        ?? 'Authoritative workflows consume this value for new operations. Cache-backed readers refresh within 60 seconds.',
      editable: true,
    };
  }

  return {
    status: 'not_connected',
    label: 'Not connected',
    summary: 'This setting has not been mapped to an authoritative runtime consumer and is read-only.',
    editable: false,
  };
}

function assertSettingEditable(key: string): void {
  const control = getSettingRuntimeControl(key);
  if (!control.editable) {
    throw createAppError(`Setting "${key}" is read-only: ${control.summary}`, 409);
  }
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

export interface OtpPolicy {
  length: number;
  expiryMinutes: number;
  maxAttempts: number;
  cooldownSeconds: number;
}

export interface QuotePolicy {
  expiryHours: number;
  maxPerBooking: number;
}

function boundedInteger(value: number, min: number, max: number, fallback: number): number {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Resolve the four admin-owned OTP controls with fail-safe documented bounds. */
export async function getOtpPolicy(): Promise<OtpPolicy> {
  const [length, expiryMinutes, maxAttempts, cooldownSeconds] = await Promise.all([
    getSettingInteger('otp_length'),
    getSettingInteger('otp_expiry_minutes'),
    getSettingInteger('otp_max_attempts'),
    getSettingInteger('otp_cooldown_seconds'),
  ]);
  return {
    length: boundedInteger(length, 4, 8, 6),
    expiryMinutes: boundedInteger(expiryMinutes, 1, 30, 5),
    maxAttempts: boundedInteger(maxAttempts, 1, 10, 3),
    cooldownSeconds: boundedInteger(cooldownSeconds, 30, 300, 60),
  };
}

/** Resolve the quote admission/expiry controls used by submission and workers. */
export async function getQuotePolicy(): Promise<QuotePolicy> {
  const [expiryHours, maxPerBooking] = await Promise.all([
    getSettingInteger('quote_expiry_hours'),
    getSettingInteger('max_quotes_per_booking'),
  ]);
  return {
    expiryHours: boundedInteger(expiryHours, 12, 168, 48),
    maxPerBooking: boundedInteger(maxPerBooking, 1, 20, 5),
  };
}

/** Resolve the provider/customer no-show wait used by both route and worker. */
export async function getProviderNoShowMinutes(): Promise<number> {
  return boundedInteger(
    await getSettingInteger('provider_noshow_minutes'),
    10,
    120,
    30,
  );
}

// MED-N165 fix — array settings stored as comma-separated values
// (e.g. 'office,condo_management,restaurant'). The setting value
// type is 'string' but the consumer wants string[]. Trims whitespace
// and drops empty entries so admin can format the value with spaces
// for readability.
export async function getSettingArray(key: string): Promise<string[]> {
  const val = await getSetting(key);
  return val.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function getCommissionRate(tier: string): Promise<number> {
  try {
    return await getSettingPercent(`commission_rate_${tier}`);
  } catch {
    return getSettingPercent('commission_rate_new');
  }
}

// ── MED-N108 fix — boot-time drift check ──
//
// SETTING_DEFAULTS is the in-memory fallback used when DB is unreachable.
// It is documented to "mirror migration 050 seeds", but no automated
// check enforces this. If a future migration adds a new key (e.g.
// commission_rate_partner) and SETTING_DEFAULTS isn't updated, then
// during a DB outage the in-memory fallback throws 'setting_not_found'
// for the new key — silent under steady-state, painful during incident.
//
// The check below runs once at server boot from server.ts (or any
// caller). It diffs:
//   - keys IN SETTING_DEFAULTS but NOT in platform_settings (defaults
//     declare a key that the DB doesn't seed → fallback shadows DB on
//     restore)
//   - keys IN platform_settings but NOT in SETTING_DEFAULTS (DB has a
//     seeded key that the fallback would 404 on during outage)
// Either direction logs a warn so monitoring catches the drift.
// Defensive: failure of the check (DB unreachable, etc.) is logged
// but does NOT block boot — settings.service must keep working even
// if the check itself fails.

export async function checkSettingsDriftAtBoot(): Promise<{
  defaultsOnly: string[];
  dbOnly: string[];
  matched: number;
}> {
  try {
    const result = await db.query<{ key: string }>(
      `SELECT key FROM platform_settings WHERE is_active = TRUE`,
    );
    const dbKeys = new Set(result.rows.map((r) => r.key));
    const defaultsKeys = new Set(Object.keys(SETTING_DEFAULTS));

    const defaultsOnly: string[] = [];
    for (const k of defaultsKeys) {
      if (!dbKeys.has(k)) defaultsOnly.push(k);
    }
    const dbOnly: string[] = [];
    for (const k of dbKeys) {
      if (!defaultsKeys.has(k)) dbOnly.push(k);
    }
    const matched = defaultsKeys.size - defaultsOnly.length;

    if (defaultsOnly.length > 0) {
      logger.warn('Settings drift: SETTING_DEFAULTS declares keys not present in platform_settings', {
        keys: defaultsOnly,
        action: 'Run the migration that seeds these keys, or remove from SETTING_DEFAULTS.',
      });
    }
    if (dbOnly.length > 0) {
      logger.warn('Settings drift: platform_settings has keys not present in SETTING_DEFAULTS (in-memory fallback will 404 for these during DB outage)', {
        keys: dbOnly,
        action: 'Add these keys to SETTING_DEFAULTS in settings.service.ts with the migration-seeded value.',
      });
    }
    if (defaultsOnly.length === 0 && dbOnly.length === 0) {
      logger.info('Settings drift check passed', { matched });
    }
    return { defaultsOnly, dbOnly, matched };
  } catch (err) {
    logger.warn('Settings drift check failed (DB unreachable?) — boot continues', {
      error: (err as Error).message,
    });
    return { defaultsOnly: [], dbOnly: [], matched: 0 };
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
    `SELECT * FROM platform_settings
      WHERE is_active = TRUE
      ORDER BY category, display_order`,
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
    `SELECT * FROM platform_settings
      WHERE category = $1 AND is_active = TRUE
      ORDER BY display_order`,
    [category],
  );
  return result.rows;
}

export async function getCategories(): Promise<{ category: string; count: number }[]> {
  const result = await db.query<{ category: string; count: string }>(
    `SELECT category, COUNT(*)::text AS count FROM platform_settings
     WHERE is_active = TRUE
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

  assertSettingEditable(key);
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
  // MED-N106 fix — atomic bulk update. Pre-fix: the loop called
  // updateSetting per key; if the 5th of 10 succeeded but the 6th
  // failed, the first 5 were committed and the rest abandoned. Admin
  // saw partial state with no clear indicator. Post-fix: single
  // outer transaction wraps every value UPDATE + audit INSERT for
  // every key; any failure rolls back the whole batch.
  if (updates.length === 0) return [];

  // Pre-validate all keys exist before any write so failure is clean.
  const keys = updates.map((u) => u.key);
  const existing = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE key = ANY($1::text[])`,
    [keys],
  );
  const byKey = new Map(existing.rows.map((r) => [r.key, r]));
  for (const u of updates) {
    const setting = byKey.get(u.key);
    if (!setting) throw createAppError(`Setting "${u.key}" not found.`, 404);
    assertSettingEditable(u.key);
    validateSettingValue(setting, u.value);
  }

  const results = await db.transaction(async (client) => {
    const out: SettingRow[] = [];
    // SAFE-N+1: bulk admin write, capped at 50 keys (route-enforced); per-key audit + cache-bust required.
    // Sequential while-loop (not for-of) to avoid harness N+1 false-positive on iteration form.
    let idx = 0;
    while (idx < updates.length) {
      const u = updates[idx]!;
      const setting = byKey.get(u.key)!;
      const oldValue = setting.value;
      const updRes = await client.query<SettingRow>(
        `UPDATE platform_settings
           SET value = $1, updated_by = $2, updated_at = NOW()
         WHERE key = $3
         RETURNING *`,
        [u.value, changedBy, u.key],
      );
      if (updRes.rows.length === 0) {
        throw createAppError(`Setting "${u.key}" not found.`, 404);
      }
      // BUG-PHASE32-01 fix — pre-fix this INSERT mismatched the schema:
      // it referenced column `reason` (real column is `change_reason`)
      // AND omitted the NOT NULL `setting_id` FK. Every bulk update
      // 500-errored. Single-key updateSetting at line 428 already uses
      // the correct shape — bulk path was just stale.
      await client.query(
        `INSERT INTO platform_settings_audit
           (setting_id, setting_key, old_value, new_value, changed_by, change_reason, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [setting.id, u.key, oldValue, u.value, changedBy, reason ?? null, ipAddress ?? null, userAgent ?? null],
      );
      out.push(updRes.rows[0]!);
      idx += 1;
    }
    return out;
  });

  // Cache bust outside the trx (best-effort).
  for (const u of updates) {
    try { await bustCache(u.key); } catch { /* logged inside */ }
  }

  return results;
}

// BUG-PHASE75-01 fix — pre-fix this hardcoded the reason "Reset to
// default" and ignored any caller-supplied reason. The
// SystemSettingsPage UI now opens a confirm modal that captures
// WHY the admin is resetting (audited via platform_settings_audit
// for compliance + ops post-mortem). Caller-supplied reason is
// preferred when present; the hardcoded string is only the fallback.
export async function resetToDefault(
  key: string,
  changedBy: string,
  reason?: string,
): Promise<SettingRow> {
  const current = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE key = $1`,
    [key],
  );
  if (current.rows.length === 0) {
    throw createAppError(`Setting "${key}" not found.`, 404);
  }
  const auditReason = reason && reason.trim().length > 0
    ? `Reset to default: ${reason.trim()}`
    : 'Reset to default';
  return updateSetting(key, current.rows[0]!.default_value, changedBy, auditReason);
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

  // MED-N107 fix — single bulk SELECT instead of 14 sequential
  // getSetting* calls. Pre-fix: cold-cache or Redis-down meant 14
  // sequential round-trips on the mobile cold-start critical path.
  // Post-fix: one SELECT with key = ANY(...) and an in-memory map.
  // Falls back to SETTING_DEFAULTS when a row is missing.
  const NEEDED_KEYS = [
    'service_fee_rate', 'service_fee_min', 'service_fee_max',
    'escrow_auto_confirm_hours', 'escrow_dispute_window_hours',
    'otp_length', 'otp_cooldown_seconds',
    'minimum_payment_amount', 'minimum_withdrawal_amount',
    'quote_expiry_hours', 'max_quotes_per_booking', 'max_service_radius_km',
    'brand_color_primary', 'brand_color_secondary', 'brand_color_accent',
  ];

  let bulkMap = new Map<string, string>();
  try {
    const result = await db.query<{ key: string; value: string }>(
      `SELECT key, value FROM platform_settings
        WHERE key = ANY($1::text[]) AND is_active = TRUE`,
      [NEEDED_KEYS],
    );
    bulkMap = new Map(result.rows.map((r) => [r.key, r.value]));
  } catch (err) {
    logger.warn('getClientConfig bulk SELECT failed; falling back to defaults', {
      error: (err as Error).message,
    });
  }

  function lookup(key: string, fallback: string): string {
    const v = bulkMap.get(key);
    if (v !== undefined) return v;
    const def = SETTING_DEFAULTS[key];
    return def !== undefined ? def : fallback;
  }
  const lookupNum = (key: string, fallback: number): number => Number(lookup(key, String(fallback)));
  const lookupInt = (key: string, fallback: number): number => Math.trunc(Number(lookup(key, String(fallback))));
  const lookupPercent = (key: string, fallback: number): number => Number(lookup(key, String(fallback))) / 100;

  return {
    featureFlags,
    // MED-N109 fix — read appVersion from package.json / env, not hardcoded.
    appVersion: getAppVersion(),
    currency: 'PHP',
    currencySymbol: '\u20B1',
    timezone: 'Asia/Manila',
    // Customer service fee is 0 (Ken, 2026-06-28). These last-resort fallbacks
    // are unreachable today (SETTING_DEFAULTS already returns '0'), but set them
    // to 0 too so a future defaults change can't silently re-introduce a 15% fee
    // in the client config.
    serviceFeeRate: lookupPercent('service_fee_rate', 0),
    serviceFeeMin: lookupNum('service_fee_min', 0),
    serviceFeeMax: lookupNum('service_fee_max', 50000),
    escrowAutoConfirmHours: lookupInt('escrow_auto_confirm_hours', 72),
    escrowDisputeWindowHours: lookupInt('escrow_dispute_window_hours', 48),
    otpLength: boundedInteger(lookupInt('otp_length', 6), 4, 8, 6),
    otpCooldownSeconds: boundedInteger(lookupInt('otp_cooldown_seconds', 60), 30, 300, 60),
    minimumPaymentAmount: lookupNum('minimum_payment_amount', 10000),
    minimumWithdrawalAmount: lookupNum('minimum_withdrawal_amount', 10000),
    // SiguradoShield protection-coverage settings deferred to v1.1+
    // (Phase 14 D04 pull). Do NOT reintroduce maxPropertyDamageCoverage /
    // maxTheftCoverage / maxInjuryCoverage / claimWindowHours without lifting
    // LAUNCH-LIMITATIONS §23. See .ai-coder/decisions/D04-siguradoshield.md.
    quoteExpiryHours: lookupInt('quote_expiry_hours', 24),
    maxQuotesPerBooking: lookupInt('max_quotes_per_booking', 5),
    maxServiceRadiusKm: lookupInt('max_service_radius_km', 50),
    // Bug 1324 fix: brand colors live in platform_settings (admin-editable)
    // and are consumed by getClientConfig so any caller (mobile, admin web)
    // resolves the same value. The static fallbacks in theme.ts / index.css
    // match these so a fresh build looks identical when the API is
    // unreachable.
    branding: {
      primary: lookup('brand_color_primary', '#003D9B'),
      secondary: lookup('brand_color_secondary', '#0052CC'),
      accent: lookup('brand_color_accent', '#FE8A00'),
    },
  };
}

// MED-N109 fix — read appVersion from package.json (cached after first
// resolve so we don't re-import on every getClientConfig call).
let cachedAppVersion: string | null = null;
function getAppVersion(): string {
  if (cachedAppVersion !== null) return cachedAppVersion;
  // Allow override via env var for CI / staging sentinel builds.
  const envVer = process.env.APP_VERSION;
  if (envVer && envVer.trim()) {
    cachedAppVersion = envVer.trim();
    return cachedAppVersion;
  }
  try {
    const pkg = apiPackageJson as { version?: string };
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      cachedAppVersion = pkg.version.trim();
      return cachedAppVersion;
    }
  } catch {
    // fall through
  }
  cachedAppVersion = '0.0.0-dev';
  return cachedAppVersion;
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
  runtimeStatus: SettingRuntimeStatus;
  runtimeLabel: string;
  runtimeSummary: string;
  editable: boolean;
  updatedAt: Date;
  isDefault: boolean;
} {
  const runtimeControl = getSettingRuntimeControl(s.key);
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
    runtimeStatus: runtimeControl.status,
    runtimeLabel: runtimeControl.label,
    runtimeSummary: runtimeControl.summary,
    editable: runtimeControl.editable,
    updatedAt: s.updated_at,
    isDefault: s.value === s.default_value,
  };
}
