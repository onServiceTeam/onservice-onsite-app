# RUNTIME PLATFORM CONFIGURATION SYSTEM
# ════════════════════════════════════════════════════════════════
# HISTORICAL TARGET DESIGN. The current implementation is mixed: selected
# settings are database-backed through settings.service, while other constants
# remain code/config controlled. Example seeds and labels below are not proof of
# deployed values. Guarantee-related settings are accounting fields only and do
# not authorize a customer promise while E10/F#10 is open.
# ════════════════════════════════════════════════════════════════
# Architecture: Database-backed → Redis-cached → In-memory fallback
# Admin UI: Organized by category with validation, audit trail, and live preview
# Impact: Replaces ALL hardcoded platformConfig references across 21 backend files
# ════════════════════════════════════════════════════════════════

## Current operational truth (2026-08-24)

The admin Settings screen now reports one of three server-owned states for every row:

- **Live control:** the authoritative workflow consumes the row. Cache-backed readers refresh within 60 seconds; some direct readers apply the value on the next operation.
- **Launch hold:** code can read the row, but the related product capability is deliberately unavailable. The row is read-only.
- **Not connected:** an authoritative API, worker, security, or cache path still uses deployed TypeScript/environment configuration. The row is read-only because changing it could otherwise make customer/provider guidance disagree with enforcement.

The current not-connected set is VAT, seven escrow/payment/surge rows, three JWT/admin-session rows, and the unused provider-profile cache TTL. Sixty rows are live and three are launch-held. Quote admission/expiry, provider no-show, provider maximum service radius, CAPTCHA escalation, suspicious-IP detection, category cache, and catalog-search cache were connected during the 2026-08-24/25 audit. New or unknown rows fail closed as not connected until their consumer is audited. The `requires_restart` database column is retained for schema compatibility, but it is not treated as evidence that a row becomes effective after restart.

`max_service_radius_km` is the authoritative provider-radius ceiling. The provider application, provider self-service change request, super-admin approval, and direct Provider 360 override all read it and enforce the migration bounds of 5-100 km. Provider onboarding reads the public config value for its choices. A provider area-change approval also revalidates the proposed location pin against the selected active/soft-launch area before changing matching coordinates.

The internal large-payout review threshold is a live control. It remains capped at ₱500,000 and causes new single-payout requests at or above the saved threshold to enter an internal review hold. It is not a statutory AML classification or filing rule.

# ┌──────────────────────────────────────────────────────────────┐
# │ OVERVIEW                                                     │
# │                                                              │
# │ Current state: platformConfig is a hardcoded TypeScript      │
# │ const in packages/api/src/config/platform.config.ts.         │
# │ Changing ANY value requires a code change + redeployment.    │
# │                                                              │
# │ Target state: All business-configurable values stored in     │
# │ PostgreSQL, cached in Redis (60s TTL), with a beautiful      │
# │ admin UI for real-time changes. Code changes only needed     │
# │ for adding NEW settings — never for changing existing values.│
# │                                                              │
# │ Architecture:                                                │
# │   DB (source of truth)                                       │
# │     ↓ (on change, bust cache)                                │
# │   Redis (60s TTL cache)                                      │
# │     ↓ (on miss, read DB)                                     │
# │   In-memory fallback (hardcoded defaults if both fail)       │
# │     ↓                                                        │
# │   Every service reads via getConfig('key')                   │
# └──────────────────────────────────────────────────────────────┘


# ════════════════════════════════════════════════════════════════
# PART 1: DATABASE MIGRATION
# ════════════════════════════════════════════════════════════════

Create `packages/api/migrations/030_platform_settings.sql`:

```sql
-- Runtime platform configuration.
-- Every business-configurable value lives here.
-- Organized by category for the admin UI.

CREATE TABLE platform_settings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),

    -- Grouping
    category VARCHAR(50) NOT NULL,       -- 'commissions', 'fees', 'escrow', 'otp', etc.
    subcategory VARCHAR(50),             -- optional sub-grouping

    -- Setting identity
    key VARCHAR(100) NOT NULL UNIQUE,    -- 'commission_rate_new', 'service_fee_rate', etc.
    label VARCHAR(200) NOT NULL,         -- Human-readable: 'New Provider Commission Rate'
    description TEXT,                    -- Explanation shown in admin UI

    -- Value
    value_type VARCHAR(20) NOT NULL
        CHECK (value_type IN ('number', 'percent', 'currency', 'integer', 'boolean', 'string', 'json')),
    value TEXT NOT NULL,                 -- Stored as text, cast on read
    default_value TEXT NOT NULL,         -- Original default for reset

    -- Validation
    min_value DECIMAL(12,4),             -- For numeric types
    max_value DECIMAL(12,4),
    allowed_values TEXT[],               -- For enum-like string settings

    -- Display
    display_order INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(20),                    -- '%', '₱', 'hours', 'minutes', 'km', etc.
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,  -- Hide value in logs

    -- Control
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requires_restart BOOLEAN NOT NULL DEFAULT FALSE,  -- Needs server restart
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit trail for config changes
CREATE TABLE platform_settings_audit (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    setting_id UUID NOT NULL REFERENCES platform_settings(id),
    setting_key VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    change_reason TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_category ON platform_settings(category, display_order);
CREATE INDEX idx_settings_key ON platform_settings(key);
CREATE INDEX idx_settings_audit_key ON platform_settings_audit(setting_key, created_at DESC);
CREATE INDEX idx_settings_audit_by ON platform_settings_audit(changed_by, created_at DESC);

-- ════════════════════════════════════════════════════
-- SEED ALL SETTINGS WITH CURRENT VALUES AS DEFAULTS
-- ════════════════════════════════════════════════════

INSERT INTO platform_settings (category, key, label, description, value_type, value, default_value, min_value, max_value, unit, display_order) VALUES

-- ═══ COMMISSION RATES ═══
('commissions', 'commission_rate_new',      'New Provider Rate',      'Commission rate for newly registered providers', 'percent', '20', '20', 1, 50, '%', 1),
('commissions', 'commission_rate_verified', 'Verified Provider Rate', 'Commission rate for verified providers',         'percent', '18', '18', 1, 50, '%', 2),
('commissions', 'commission_rate_pro',      'Pro Provider Rate',      'Commission rate for pro-tier providers',          'percent', '15', '15', 1, 50, '%', 3),
('commissions', 'commission_rate_elite',    'Elite Provider Rate',    'Commission rate for elite-tier providers',        'percent', '12', '12', 1, 50, '%', 4),

-- ═══ SERVICE FEES ═══
('fees', 'service_fee_rate',    'Service Fee Rate',    'Fee charged to customers as a percentage of service price', 'percent', '5',     '5',     1, 25,    '%', 1),
('fees', 'minimum_service_fee', 'Minimum Service Fee', 'Minimum fee charged regardless of booking amount',          'currency', '2500', '2500', 100, 50000, '₱', 2),
('fees', 'maximum_service_fee', 'Maximum Service Fee', 'Maximum fee cap regardless of booking amount',              'currency', '50000','50000', 5000, 500000,'₱', 3),
('fees', 'guarantee_fund_rate', 'Guarantee Fund Rate', 'Percentage of service fee allocated to the guarantee fund', 'percent', '1.5',  '1.5',  0.1, 10,   '%', 4),
('fees', 'vat_rate',            'VAT Rate',            'Philippine VAT rate applied to services',                    'percent', '12',   '12',   0, 20,    '%', 5),

-- ═══ ESCROW & PAYMENT ═══
('escrow', 'escrow_auto_confirm_hours',  'Auto-Confirm Timer',     'Hours after job completion before auto-confirming and releasing escrow', 'integer', '24', '24', 1, 168, 'hours', 1),
('escrow', 'escrow_dispute_window_hours','Dispute Window',         'Hours after completion that customers can file a dispute',               'integer', '48', '24', 12, 168, 'hours', 2),
('escrow', 'minimum_payment_amount',     'Minimum Payment',        'Minimum booking payment amount (PayMongo minimum is ₱100)',              'currency', '10000', '10000', 10000, 100000, '₱', 3),
('escrow', 'minimum_withdrawal_amount',  'Minimum Withdrawal',     'Minimum amount providers can withdraw',                                  'currency', '10000', '50000', 5000, 100000, '₱', 4),
('escrow', 'withdrawal_processing_days', 'Withdrawal Processing',  'Business days to process provider withdrawals',                          'integer', '3', '3', 1, 14, 'days', 5),

-- ═══ CANCELLATION FEES (FR-102) ═══
('cancellation', 'cancel_refund_over_24h',         'Refund >24h Before',         'Customer refund % when cancelling >24h before scheduled time',        'percent', '100', '100', 0, 100, '%', 1),
('cancellation', 'cancel_refund_2_to_24h',         'Refund 2-24h Before',        'Customer refund % when cancelling 2-24h before',                     'percent', '100', '100', 0, 100, '%', 2),
('cancellation', 'cancel_refund_1_to_2h',          'Refund 1-2h Before',         'Customer refund % when cancelling 1-2h before',                      'percent', '90',  '90',  0, 100, '%', 3),
('cancellation', 'cancel_refund_30min_to_1h',      'Refund 30min-1h Before',     'Customer refund % when cancelling 30min-1h before',                  'percent', '80',  '80',  0, 100, '%', 4),
('cancellation', 'cancel_refund_under_30min',      'Refund <30min Before',       'Customer refund % when cancelling <30min before or provider en route','percent', '70',  '70',  0, 100, '%', 5),
('cancellation', 'cancel_refund_provider_arrived', 'Refund After Arrival',       'Customer refund % when cancelling after provider has arrived',        'percent', '50',  '50',  0, 100, '%', 6),
('cancellation', 'cancel_refund_customer_noshow',  'Refund on Customer No-Show', 'Customer refund % on customer no-show',                              'percent', '0',   '0',   0, 100, '%', 7),

-- ═══ SIGURADOSHIELD PROTECTION ═══
('protection', 'max_property_damage_coverage', 'Max Property Damage',  'Maximum coverage for property damage per incident',            'currency', '2500000', '2500000', 100000, 10000000, '₱', 1),
('protection', 'max_theft_coverage',           'Max Theft Coverage',   'Maximum coverage for theft per incident (requires police report)', 'currency', '1000000', '1000000', 100000, 5000000, '₱', 2),
('protection', 'max_injury_coverage',          'Max Injury Coverage',  'Maximum medical reimbursement for provider-caused injury',      'currency', '5000000', '5000000', 100000, 10000000, '₱', 3),
('protection', 'damage_deductible_threshold',  'Deductible Threshold', 'Claims above this amount have a deductible applied',           'currency', '500000',  '500000',  0, 2000000, '₱', 4),
('protection', 'damage_deductible_amount',     'Deductible Amount',    'Deductible amount for claims above the threshold',             'currency', '50000',   '50000',   0, 500000, '₱', 5),
('protection', 'claim_window_hours',           'Claim Window',         'Hours after service to file an insurance claim',               'integer', '48',       '48',       24, 168, 'hours', 6),
('protection', 'auto_suspend_claim_count',     'Auto-Suspend Claims',  'Number of valid claims in 30 days before auto-suspending provider', 'integer', '3', '3', 1, 10, 'claims', 7),
('protection', 'provider_recovery_rate',       'Provider Recovery %',  'Percentage of claim amount recovered from provider',           'percent', '100',      '100',      0, 100, '%', 8),

-- ═══ OTP & AUTH ═══
('auth', 'otp_length',              'OTP Length',           'Number of digits in OTP codes',                   'integer', '6', '6', 4, 8, 'digits', 1),
('auth', 'otp_expiry_minutes',      'OTP Expiry',           'Minutes before an OTP code expires',              'integer', '5', '5', 1, 30, 'minutes', 2),
('auth', 'otp_max_attempts',        'Max OTP Attempts',     'Maximum verification attempts before lockout',    'integer', '3', '3', 1, 10, 'attempts', 3),
('auth', 'otp_cooldown_seconds',    'OTP Cooldown',         'Seconds between OTP resend requests',             'integer', '60', '60', 30, 300, 'seconds', 4),
('auth', 'jwt_access_expires',      'Access Token TTL',     'Access token expiration duration',                'string', '15m', '15m', NULL, NULL, NULL, 5),
('auth', 'jwt_refresh_expires',     'Refresh Token TTL',    'Refresh token expiration duration',               'string', '30d', '30d', NULL, NULL, NULL, 6),
('auth', 'admin_session_timeout_hours', 'Admin Session TTL', 'Admin session timeout duration',                 'integer', '8', '8', 1, 24, 'hours', 7),

-- ═══ PROVIDER SETTINGS ═══
('provider', 'provider_noshow_minutes',  'No-Show Timeout',    'Minutes after scheduled time before flagging as no-show',  'integer', '30', '30', 10, 120, 'minutes', 1),
('provider', 'nbi_expiry_warning_days',  'NBI Expiry Warning', 'Days before NBI expiry to send warning notification',      'integer', '30', '30', 7, 90, 'days', 2),
('provider', 'max_service_radius_km',    'Max Service Radius', 'Maximum radius a provider can set for their service area', 'integer', '50', '50', 5, 100, 'km', 3),
('provider', 'quote_expiry_hours',       'Quote Expiry',       'Hours before a submitted quote expires',                   'integer', '48', '48', 12, 168, 'hours', 4),
('provider', 'max_quotes_per_booking',   'Max Quotes/Booking', 'Maximum number of providers who can quote on one job',     'integer', '5', '5', 1, 20, 'quotes', 5),

-- ═══ RATE LIMITING ═══
('security', 'rate_limit_window_ms',       'Rate Limit Window',     'Time window for rate limiting',                'integer', '900000', '900000', 60000, 3600000, 'ms', 1),
('security', 'rate_limit_max_requests',    'Max Requests/Window',   'Maximum API requests per window',              'integer', '100', '100', 10, 1000, 'requests', 2),
('security', 'suspicious_ip_threshold',    'IP Block Threshold',    'Failed requests before blocking an IP',        'integer', '50', '50', 10, 500, 'attempts', 3),
('security', 'captcha_threshold',          'CAPTCHA Threshold',     'Failed OTPs before requiring CAPTCHA',         'integer', '3', '3', 1, 10, 'attempts', 4),

-- ═══ CACHE TTLs ═══
('cache', 'cache_ttl_categories',      'Categories Cache',      'Cache duration for service categories',        'integer', '86400', '86400', 60, 604800, 'seconds', 1),
('cache', 'cache_ttl_provider_profile','Provider Profile Cache', 'Cache duration for provider profiles',        'integer', '1800',  '1800',  60, 86400, 'seconds', 2),
('cache', 'cache_ttl_search_results',  'Search Results Cache',  'Cache duration for search results',            'integer', '300',   '300',   30, 3600, 'seconds', 3)

ON CONFLICT (key) DO NOTHING;
```


# ════════════════════════════════════════════════════════════════
# PART 2: BACKEND SETTINGS SERVICE
# ════════════════════════════════════════════════════════════════

Create `packages/api/src/services/settings.service.ts`:

```typescript
/**
 * Runtime Platform Settings Service
 *
 * Architecture: PostgreSQL (source of truth) → Redis (60s cache) → In-memory defaults
 *
 * Usage:
 *   const rate = await getSettingNumber('commission_rate_new');
 *   const allCommissions = await getSettingsByCategory('commissions');
 *   await updateSetting('commission_rate_new', '18', adminUserId, 'Adjusted for market');
 */

import { db } from '../models/db';
import { redis } from '../config/redis.config';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import { platformConfig } from '../config/platform.config';

const CACHE_PREFIX = 'settings:';
const CACHE_ALL_KEY = 'settings:__all__';
const CACHE_TTL = 60; // seconds

// ─── In-memory defaults (fallback if DB + Redis both fail) ───

const DEFAULTS: Record<string, string> = {
  commission_rate_new: '20',
  commission_rate_verified: '18',
  commission_rate_pro: '15',
  commission_rate_elite: '12',
  service_fee_rate: '5',
  minimum_service_fee: '2500',
  maximum_service_fee: '50000',
  guarantee_fund_rate: '1.5',
  escrow_auto_confirm_hours: '24',
  escrow_dispute_window_hours: '48',
  minimum_withdrawal_amount: '50000',
  // ... all other defaults matching the migration seed values
};

// ─── Types ───

interface SettingRow {
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

interface AuditRow {
  id: string;
  setting_key: string;
  old_value: string | null;
  new_value: string;
  changed_by: string;
  change_reason: string | null;
  created_at: Date;
}

// ─── Core Read Functions ───

export async function getSetting(key: string): Promise<string> {
  // 1. Try Redis cache
  try {
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);
    if (cached !== null) return cached;
  } catch { /* Redis failure is non-fatal */ }

  // 2. Try database
  try {
    const result = await db.query<{ value: string }>(
      `SELECT value FROM platform_settings WHERE key = $1 AND is_active = TRUE`,
      [key],
    );
    if (result.rows.length > 0) {
      const val = result.rows[0]!.value;
      // Write back to cache
      try { await redis.set(`${CACHE_PREFIX}${key}`, val, 'EX', CACHE_TTL); } catch { /* ignore */ }
      return val;
    }
  } catch (err) {
    logger.error('Settings DB read failed', { key, error: (err as Error).message });
  }

  // 3. In-memory default
  const fallback = DEFAULTS[key];
  if (fallback !== undefined) return fallback;

  throw createAppError(`Setting "${key}" not found.`, 404);
}

export async function getSettingNumber(key: string): Promise<number> {
  const val = await getSetting(key);
  return Number(val);
}

export async function getSettingPercent(key: string): Promise<number> {
  const val = await getSetting(key);
  return Number(val) / 100; // '15' → 0.15
}

export async function getSettingBoolean(key: string): Promise<boolean> {
  const val = await getSetting(key);
  return val === 'true' || val === '1';
}

export async function getSettingInteger(key: string): Promise<number> {
  const val = await getSetting(key);
  return Math.round(Number(val));
}

// ─── Bulk Read ───

export async function getAllSettings(): Promise<SettingRow[]> {
  // Try cache first
  try {
    const cached = await redis.get(CACHE_ALL_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }

  const result = await db.query<SettingRow>(
    `SELECT * FROM platform_settings ORDER BY category, display_order`,
  );

  try {
    await redis.set(CACHE_ALL_KEY, JSON.stringify(result.rows), 'EX', CACHE_TTL);
  } catch { /* ignore */ }

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
    `SELECT category, COUNT(*)::text as count FROM platform_settings
     GROUP BY category ORDER BY category`,
  );
  return result.rows.map(r => ({ category: r.category, count: Number(r.count) }));
}

// ─── Write Functions ───

export async function updateSetting(
  key: string,
  newValue: string,
  changedBy: string,
  reason?: string,
  ipAddress?: string,
): Promise<SettingRow> {
  // Get current setting with validation rules
  const current = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE key = $1`,
    [key],
  );
  if (current.rows.length === 0) throw createAppError(`Setting "${key}" not found.`, 404);
  const setting = current.rows[0]!;

  // Validate the new value
  validateSettingValue(setting, newValue);

  const oldValue = setting.value;

  // Update in DB
  const updated = await db.query<SettingRow>(
    `UPDATE platform_settings
     SET value = $1, updated_by = $2, updated_at = NOW()
     WHERE key = $3
     RETURNING *`,
    [newValue, changedBy, key],
  );

  // Create audit record
  await db.query(
    `INSERT INTO platform_settings_audit (setting_id, setting_key, old_value, new_value, changed_by, change_reason, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [setting.id, key, oldValue, newValue, changedBy, reason ?? null, ipAddress ?? null],
  );

  // Bust cache
  await bustCache(key);

  logger.info('Platform setting updated', {
    key, oldValue: setting.is_sensitive ? '[REDACTED]' : oldValue,
    newValue: setting.is_sensitive ? '[REDACTED]' : newValue,
    changedBy, reason,
  });

  return updated.rows[0]!;
}

export async function bulkUpdateSettings(
  updates: Array<{ key: string; value: string }>,
  changedBy: string,
  reason?: string,
  ipAddress?: string,
): Promise<SettingRow[]> {
  const results: SettingRow[] = [];
  for (const { key, value } of updates) {
    const result = await updateSetting(key, value, changedBy, reason, ipAddress);
    results.push(result);
  }
  return results;
}

export async function resetToDefault(key: string, changedBy: string): Promise<SettingRow> {
  const current = await db.query<SettingRow>(
    `SELECT * FROM platform_settings WHERE key = $1`,
    [key],
  );
  if (current.rows.length === 0) throw createAppError(`Setting "${key}" not found.`, 404);

  return updateSetting(key, current.rows[0]!.default_value, changedBy, 'Reset to default');
}

export async function getSettingAuditHistory(
  key: string,
  limit = 50,
): Promise<AuditRow[]> {
  const result = await db.query<AuditRow>(
    `SELECT sa.*, u.first_name || ' ' || u.last_name as changed_by_name
     FROM platform_settings_audit sa
     LEFT JOIN users u ON sa.changed_by = u.id
     WHERE sa.setting_key = $1
     ORDER BY sa.created_at DESC
     LIMIT $2`,
    [key, limit],
  );
  return result.rows;
}

// ─── Validation ───

function validateSettingValue(setting: SettingRow, newValue: string): void {
  const { value_type, min_value, max_value, allowed_values, key } = setting;

  if (value_type === 'number' || value_type === 'percent' || value_type === 'currency' || value_type === 'integer') {
    const num = Number(newValue);
    if (isNaN(num)) throw createAppError(`Setting "${key}" requires a numeric value.`, 400);
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

// ─── Cache Management ───

async function bustCache(key: string): Promise<void> {
  try {
    await redis.del(`${CACHE_PREFIX}${key}`);
    await redis.del(CACHE_ALL_KEY);
  } catch { /* non-fatal */ }
}

export async function bustAllCache(): Promise<void> {
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* non-fatal */ }
}

// ─── Convenience: Get commission rate for a tier ───

export async function getCommissionRate(tier: string): Promise<number> {
  const key = `commission_rate_${tier}`;
  try {
    return await getSettingPercent(key);
  } catch {
    // Fallback to 'new' rate if tier not found
    return await getSettingPercent('commission_rate_new');
  }
}

// ─── Mobile client config endpoint data ───

export async function getClientConfig(): Promise<Record<string, unknown>> {
  return {
    serviceFeeRate: await getSettingPercent('service_fee_rate'),
    minimumServiceFee: await getSettingNumber('minimum_service_fee'),
    maximumServiceFee: await getSettingNumber('maximum_service_fee'),
    escrowAutoConfirmHours: await getSettingInteger('escrow_auto_confirm_hours'),
    escrowDisputeWindowHours: await getSettingInteger('escrow_dispute_window_hours'),
    otpLength: await getSettingInteger('otp_length'),
    otpCooldownSeconds: await getSettingInteger('otp_cooldown_seconds'),
    minimumWithdrawalAmount: await getSettingNumber('minimum_withdrawal_amount'),
    maxPropertyDamageCoverage: await getSettingNumber('max_property_damage_coverage'),
    maxTheftCoverage: await getSettingNumber('max_theft_coverage'),
    maxInjuryCoverage: await getSettingNumber('max_injury_coverage'),
    claimWindowHours: await getSettingInteger('claim_window_hours'),
    appVersion: platformConfig.appVersion,  // This one stays in code
    currency: 'PHP',
    currencySymbol: '₱',
    timezone: 'Asia/Manila',
  };
}

// ─── Format for API response ───

export function formatSetting(s: SettingRow) {
  return {
    id: s.id,
    category: s.category,
    subcategory: s.subcategory,
    key: s.key,
    label: s.label,
    description: s.description,
    valueType: s.value_type,
    value: s.is_sensitive ? '••••••' : s.value,
    defaultValue: s.default_value,
    minValue: s.min_value ? Number(s.min_value) : null,
    maxValue: s.max_value ? Number(s.max_value) : null,
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
```


# ════════════════════════════════════════════════════════════════
# PART 3: ADMIN API ROUTES
# ════════════════════════════════════════════════════════════════

Create `packages/api/src/routes/settings.routes.ts`:

```typescript
import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as settingsService from '../services/settings.service';

const router = Router();

// All settings routes require admin role
router.use(authMiddleware);
router.use(rbacMiddleware(['admin', 'super_admin']));

// GET /api/v1/admin/settings — all settings grouped by category
router.get('/', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getAllSettings();
    const categories = await settingsService.getCategories();

    // Group by category
    const grouped: Record<string, ReturnType<typeof settingsService.formatSetting>[]> = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(settingsService.formatSetting(s));
    }

    res.json({
      success: true,
      data: { categories, settings: grouped },
    });
  } catch (error) { next(error); }
});

// GET /api/v1/admin/settings/:category — settings for one category
router.get('/:category', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await settingsService.getSettingsByCategory(req.params.category!);
    res.json({
      success: true,
      data: settings.map(settingsService.formatSetting),
    });
  } catch (error) { next(error); }
});

// PUT /api/v1/admin/settings/:key — update a single setting
router.put('/:key', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { value, reason } = req.body;
    if (value === undefined || value === null) throw createAppError('Value is required.', 400);

    const updated = await settingsService.updateSetting(
      req.params.key!,
      String(value),
      req.user!.userId,
      reason,
      req.ip,
    );

    res.json({ success: true, data: settingsService.formatSetting(updated) });
  } catch (error) { next(error); }
});

// PUT /api/v1/admin/settings — bulk update
router.put('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { updates, reason } = req.body as {
      updates: Array<{ key: string; value: string }>;
      reason?: string;
    };

    if (!Array.isArray(updates) || updates.length === 0) {
      throw createAppError('Updates array is required.', 400);
    }
    if (updates.length > 50) {
      throw createAppError('Maximum 50 settings per batch update.', 400);
    }

    const results = await settingsService.bulkUpdateSettings(
      updates, req.user!.userId, reason, req.ip,
    );

    res.json({
      success: true,
      data: results.map(settingsService.formatSetting),
      message: `${results.length} settings updated.`,
    });
  } catch (error) { next(error); }
});

// POST /api/v1/admin/settings/:key/reset — reset to default
router.post('/:key/reset', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const updated = await settingsService.resetToDefault(req.params.key!, req.user!.userId);
    res.json({ success: true, data: settingsService.formatSetting(updated) });
  } catch (error) { next(error); }
});

// GET /api/v1/admin/settings/:key/history — audit history
router.get('/:key/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const history = await settingsService.getSettingAuditHistory(req.params.key!);
    res.json({ success: true, data: history });
  } catch (error) { next(error); }
});

export default router;
```

Wire into server.ts:
```typescript
import settingsRoutes from './routes/settings.routes';
app.use('/api/v1/admin/settings', settingsRoutes);
```

Also add a PUBLIC endpoint for mobile client config:
```typescript
// In server.ts or a new route file — NO auth required
app.get('/api/v1/config', async (_req, res) => {
  try {
    const config = await settingsService.getClientConfig();
    res.json({ success: true, data: config });
  } catch {
    // Fallback to hardcoded defaults if settings service fails
    res.json({ success: true, data: { /* hardcoded defaults */ } });
  }
});
```


# ════════════════════════════════════════════════════════════════
# PART 4: REPLACE ALL HARDCODED platformConfig READS
# ════════════════════════════════════════════════════════════════

Every service that reads platformConfig.X needs to change to use the settings service.
The key change: reads become async (database/cache lookup).

Example replacements:

```typescript
// OLD (synchronous, hardcoded):
const commissionRate = platformConfig.commissionRates[tier] ?? platformConfig.commissionRates['new']!;

// NEW (async, database-backed):
const commissionRate = await settingsService.getCommissionRate(tier);
```

```typescript
// OLD:
const fee = Math.round(servicePrice * platformConfig.serviceFeeRate);

// NEW:
const serviceFeeRate = await settingsService.getSettingPercent('service_fee_rate');
const fee = Math.round(servicePrice * serviceFeeRate);
```

```typescript
// OLD:
const windowHours = platformConfig.escrowAutoConfirmHours ?? 24;

// NEW:
const windowHours = await settingsService.getSettingInteger('escrow_auto_confirm_hours');
```

FILES TO UPDATE (all 21):
1. commission.service.ts — getCommissionRate(tier), getSettingPercent('service_fee_rate'), etc.
2. booking.service.ts — getSettingPercent('service_fee_rate'), getSettingNumber min/max fee
3. escrow.service.ts — (already fixed in CRIT-001, use settings service there too)
4. auth.service.ts — getSettingInteger('otp_expiry_minutes'), etc.
5. matching.service.ts — getSettingInteger('max_quotes_per_booking')
6. payout.service.ts — getSettingNumber('minimum_withdrawal_amount')
7. workers.ts — all timer values from settings
8. ... (all other 14 files)

IMPORTANT: Keep the hardcoded platformConfig.ts as the IN-MEMORY FALLBACK.
If the database and Redis are both down, the system still works with defaults.
The settings service already does this (see the DEFAULTS map and getSetting() fallback chain).


# ════════════════════════════════════════════════════════════════
# PART 5: MOBILE APP — FETCH CONFIG AT STARTUP
# ════════════════════════════════════════════════════════════════

Replace the hardcoded mobile platformConfig with a dynamic fetch:

Create `apps/mobile/src/services/config.service.ts`:
```typescript
import api from './api';
import { platformConfig as defaults } from '@/config/platform.config';

let cachedConfig: Record<string, unknown> | null = null;

export async function fetchPlatformConfig(): Promise<typeof defaults> {
  try {
    const res = await api.get<{ success: boolean; data: Record<string, unknown> }>('/api/v1/config');
    cachedConfig = res.data.data;
    return { ...defaults, ...cachedConfig } as typeof defaults;
  } catch {
    return defaults; // Fallback to hardcoded if API fails
  }
}

export function getConfig(): typeof defaults {
  if (cachedConfig) return { ...defaults, ...cachedConfig } as typeof defaults;
  return defaults;
}
```

Call `fetchPlatformConfig()` during app startup (in _layout.tsx after auth hydration).
All screens that read platformConfig should use `getConfig()` instead.


# ════════════════════════════════════════════════════════════════
# PART 6: ADMIN UI — SETTINGS PAGE
# ════════════════════════════════════════════════════════════════

Create `apps/admin/src/pages/SettingsPage.tsx`

The admin settings page should be organized with these UX principles:

LAYOUT:
- Left sidebar: Category tabs (Commissions, Fees, Escrow, Cancellation, Protection, Auth, Provider, Security, Cache)
- Main area: Settings cards for selected category
- Each setting card shows: Label, current value with unit, description, edit controls
- Save button per card OR bulk save button per category

CATEGORY TABS with icons and descriptions:
  💰 Commissions — "Provider commission rates by tier"
  💳 Fees — "Service fees and guarantee fund allocation"
  🔒 Escrow — "Payment holding and release timers"
  ❌ Cancellation — "Refund percentages by cancellation timing"
  🛡️ Protection — "SiguradoShield coverage limits and claims"
  🔑 Auth — "OTP, JWT, and session settings"
  👷 Provider — "Provider management parameters"
  🔐 Security — "Rate limiting and fraud detection"
  ⚡ Cache — "Cache TTL durations"

EACH SETTING CARD contains:
  - Setting label (bold)
  - Current value displayed prominently with unit
  - Description text (smaller, gray)
  - Edit control appropriate to the value_type:
    - percent: Slider (min to max) + numeric input
    - currency: Numeric input with ₱ prefix
    - integer: Numeric input with +/- buttons
    - boolean: Toggle switch
    - string: Text input
  - "Modified" badge if value ≠ default
  - "Reset to default" link if modified
  - Last modified timestamp + who changed it

SPECIAL FEATURES:
  - "Change Reason" modal when saving (optional text explaining why the change was made)
  - Audit history expandable per setting (shows last 10 changes with who/when/why)
  - "Preview Impact" for commission changes (shows example: "For a ₱1,000 booking, provider would receive ₱820 instead of ₱800")
  - "Bulk Reset Category" button to reset all settings in a category to defaults
  - Real-time validation (red border + error message if value out of range)
  - Success toast on save
  - Unsaved changes warning when navigating away

Add to Sidebar.tsx:
```typescript
{ to: '/settings', icon: '⚙️', label: 'Settings' },
```

Add to App.tsx router:
```typescript
<Route path="/settings" element={<SettingsPage />} />
```


# ════════════════════════════════════════════════════════════════
# PART 7: CANCELLATION FEE WIRING
# ════════════════════════════════════════════════════════════════

The commission.service.ts calculateCancellationRefund() has HARDCODED percentages.
Replace with settings reads:

```typescript
export async function calculateCancellationRefund(
  amount: number,
  hoursUntilScheduled: number,
  providerArrived: boolean,
): Promise<CancellationRefund> {
  let customerRefundPercent: number;

  if (providerArrived) {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_provider_arrived');
  } else if (hoursUntilScheduled <= 0) {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_under_30min');
  } else if (hoursUntilScheduled < 0.5) {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_under_30min');
  } else if (hoursUntilScheduled < 1) {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_30min_to_1h');
  } else if (hoursUntilScheduled < 2) {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_1_to_2h');
  } else if (hoursUntilScheduled < 24) {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_2_to_24h');
  } else {
    customerRefundPercent = await settingsService.getSettingNumber('cancel_refund_over_24h');
  }

  const providerCompensationPercent = 100 - customerRefundPercent;

  return {
    customerRefundPercent,
    providerCompensationPercent,
    customerRefundAmount: Math.round(amount * (customerRefundPercent / 100)),
    providerCompensationAmount: Math.round(amount * (providerCompensationPercent / 100)),
  };
}
```

Note: This function becomes async. All callers must await it.
