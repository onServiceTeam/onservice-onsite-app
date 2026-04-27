/**
 * Phase 03 — exhaustive unit/mutation tests for settings.service.
 *
 * Strategy: mock db + redis directly so we exercise every branch of the
 * settings service against the real fallback chain (Redis → DB → in-memory
 * SETTING_DEFAULTS). The tests in runtime-config-e2e.test.ts cover the
 * core fallback chain and validation edges; this file fills the gaps the
 * mutation report identified (formatting, bulk write, audit history, cache
 * management, getClientConfig, exhaustive defaults snapshot).
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));

const redisGetMock = jest.fn();
const redisSetMock = jest.fn();
const redisDelMock = jest.fn();
const redisKeysMock = jest.fn();

jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: (...args: unknown[]) => redisGetMock(...args),
    set: (...args: unknown[]) => redisSetMock(...args),
    del: (...args: unknown[]) => redisDelMock(...args),
    keys: (...args: unknown[]) => redisKeysMock(...args),
  },
}));

import * as settingsService from '../src/services/settings.service';
import type { SettingRow } from '../src/services/settings.service';

function fakeRow(overrides: Partial<SettingRow> = {}): SettingRow {
  return {
    id: 'row-id',
    category: 'fees',
    subcategory: null,
    key: 'service_fee_rate',
    label: 'Service Fee Rate',
    description: 'desc',
    value_type: 'percent',
    value: '10',
    default_value: '10',
    min_value: null,
    max_value: null,
    allowed_values: null,
    display_order: 0,
    unit: '%',
    is_sensitive: false,
    is_active: true,
    requires_restart: false,
    updated_by: null,
    updated_at: new Date('2026-01-01T00:00:00Z'),
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisDelMock.mockReset();
  redisKeysMock.mockReset();
  redisSetMock.mockResolvedValue('OK');
  redisDelMock.mockResolvedValue(1);
  redisKeysMock.mockResolvedValue([]);
});

describe('SETTING_DEFAULTS exact-value snapshot (kills string-literal mutants)', () => {
  // Every default value below must match migration 050 seeds. Stryker mutates
  // each string literal and these assertions kill those mutants.
  const expected: Record<string, string> = {
    commission_rate_founding: '10',
    commission_rate_new: '15',
    commission_rate_verified: '13',
    commission_rate_pro: '11',
    commission_rate_elite: '9',
    service_fee_rate: '10',
    service_fee_min: '2500',
    service_fee_max: '50000',
    guarantee_fund_rate: '1.5',
    vat_rate: '12',
    escrow_auto_confirm_hours: '24',
    escrow_dispute_window_hours: '48',
    minimum_payment_amount: '10000',
    minimum_withdrawal_amount: '10000',
    withdrawal_processing_days: '3',
    cancel_refund_over_24h: '100',
    cancel_refund_2_to_24h: '100',
    cancel_refund_1_to_2h: '90',
    cancel_refund_30min_to_1h: '80',
    cancel_refund_under_30min: '70',
    cancel_refund_provider_arrived: '50',
    cancel_refund_customer_noshow: '0',
    max_property_damage_coverage: '2500000',
    max_theft_coverage: '1000000',
    max_injury_coverage: '5000000',
    damage_deductible_threshold: '500000',
    damage_deductible_amount: '50000',
    claim_window_hours: '48',
    auto_suspend_claim_count: '3',
    provider_recovery_rate: '100',
    otp_length: '6',
    otp_expiry_minutes: '5',
    otp_max_attempts: '3',
    otp_cooldown_seconds: '60',
    jwt_access_expires: '15m',
    jwt_refresh_expires: '30d',
    admin_session_timeout_hours: '8',
    provider_noshow_minutes: '30',
    nbi_expiry_warning_days: '30',
    max_service_radius_km: '50',
    quote_expiry_hours: '48',
    max_quotes_per_booking: '5',
    rate_limit_window_ms: '900000',
    rate_limit_max_requests: '100',
    suspicious_ip_threshold: '10',
    captcha_threshold: '3',
    cache_ttl_categories: '86400',
    cache_ttl_provider_profile: '1800',
    cache_ttl_search_results: '300',
  };

  it.each(Object.entries(expected))(
    'SETTING_DEFAULTS["%s"] === "%s"',
    (key, value) => {
      expect(settingsService.SETTING_DEFAULTS[key]).toBe(value);
    },
  );

  it('contains exactly the expected keys (no extras, no missing)', () => {
    expect(Object.keys(settingsService.SETTING_DEFAULTS).sort()).toEqual(
      Object.keys(expected).sort(),
    );
  });
});

describe('getSetting fallback chain — extra branches', () => {
  it('uses Redis cache and never touches DB on hit', async () => {
    redisGetMock.mockResolvedValueOnce('42');
    const v = await settingsService.getSetting('service_fee_rate');
    expect(v).toBe('42');
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('hits DB and warms cache on Redis miss', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [{ value: '11' }] });
    const v = await settingsService.getSetting('service_fee_rate');
    expect(v).toBe('11');
    expect(redisSetMock).toHaveBeenCalledWith(
      'settings:service_fee_rate',
      '11',
      'EX',
      60,
    );
  });

  it('logs and continues when Redis read throws', async () => {
    redisGetMock.mockRejectedValueOnce(new Error('redis down'));
    dbQueryMock.mockResolvedValueOnce({ rows: [{ value: '11' }] });
    const v = await settingsService.getSetting('service_fee_rate');
    expect(v).toBe('11');
  });

  it('logs and continues when cache write throws', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [{ value: '11' }] });
    redisSetMock.mockRejectedValueOnce(new Error('cache write fail'));
    const v = await settingsService.getSetting('service_fee_rate');
    expect(v).toBe('11');
  });

  it('falls back to SETTING_DEFAULTS when DB throws', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockRejectedValueOnce(new Error('db down'));
    const v = await settingsService.getSetting('service_fee_rate');
    expect(v).toBe('10');
  });

  it('throws 404 when key has no DB row and no default', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(settingsService.getSetting('not_a_real_key'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('parameterizes the SELECT with is_active = TRUE', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [{ value: '11' }] });
    await settingsService.getSetting('service_fee_rate');
    const sql = dbQueryMock.mock.calls[0]![0] as string;
    expect(sql).toContain('platform_settings');
    expect(sql).toContain('is_active = TRUE');
    expect(dbQueryMock.mock.calls[0]![1]).toEqual(['service_fee_rate']);
  });
});

describe('typed getters', () => {
  beforeEach(() => {
    redisGetMock.mockResolvedValue('12.5');
  });

  it('getSettingNumber parses as float', async () => {
    expect(await settingsService.getSettingNumber('service_fee_rate')).toBe(12.5);
  });

  it('getSettingPercent divides by 100', async () => {
    expect(await settingsService.getSettingPercent('service_fee_rate')).toBeCloseTo(0.125, 5);
  });

  it('getSettingInteger rounds', async () => {
    expect(await settingsService.getSettingInteger('service_fee_rate')).toBe(13);
  });

  it('getSettingBoolean returns true for "true"', async () => {
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValueOnce('true');
    expect(await settingsService.getSettingBoolean('flag')).toBe(true);
  });

  it('getSettingBoolean returns true for "1"', async () => {
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValueOnce('1');
    expect(await settingsService.getSettingBoolean('flag')).toBe(true);
  });

  it('getSettingBoolean returns false for "false"', async () => {
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValueOnce('false');
    expect(await settingsService.getSettingBoolean('flag')).toBe(false);
  });

  it('getSettingBoolean returns false for arbitrary string', async () => {
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValueOnce('nope');
    expect(await settingsService.getSettingBoolean('flag')).toBe(false);
  });
});

describe('getCommissionRate', () => {
  it('returns the tier-specific rate as a percent', async () => {
    redisGetMock.mockResolvedValueOnce('11');
    expect(await settingsService.getCommissionRate('pro')).toBeCloseTo(0.11, 5);
  });

  it('falls back to "new" when the tier-specific key throws', async () => {
    // First call (commission_rate_unknowntier): cache miss + db miss + no default
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    // Recovery call (commission_rate_new): cache hit
    redisGetMock.mockResolvedValueOnce('15');
    expect(await settingsService.getCommissionRate('unknowntier')).toBeCloseTo(0.15, 5);
  });
});

describe('getAllSettings', () => {
  it('returns parsed cache when present', async () => {
    const rows = [fakeRow({ key: 'a' }), fakeRow({ key: 'b' })];
    redisGetMock.mockResolvedValueOnce(JSON.stringify(rows));
    const out = await settingsService.getAllSettings();
    expect(out.length).toBe(2);
    expect(out[0]!.key).toBe('a');
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('falls through to DB when cache JSON parse fails', async () => {
    redisGetMock.mockResolvedValueOnce('{not valid json');
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow()] });
    const out = await settingsService.getAllSettings();
    expect(out.length).toBe(1);
    expect(dbQueryMock).toHaveBeenCalled();
  });

  it('reads from DB and caches when miss', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow()] });
    const out = await settingsService.getAllSettings();
    expect(out.length).toBe(1);
    expect(redisSetMock).toHaveBeenCalledWith(
      'settings:__all__',
      expect.any(String),
      'EX',
      60,
    );
  });

  it('continues when Redis read throws', async () => {
    redisGetMock.mockRejectedValueOnce(new Error('boom'));
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow()] });
    const out = await settingsService.getAllSettings();
    expect(out.length).toBe(1);
  });

  it('continues when cache write throws', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow()] });
    redisSetMock.mockRejectedValueOnce(new Error('write fail'));
    const out = await settingsService.getAllSettings();
    expect(out.length).toBe(1);
  });
});

describe('getSettingsByCategory + getCategories', () => {
  it('getSettingsByCategory parameterizes by category', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ category: 'fees' })] });
    const out = await settingsService.getSettingsByCategory('fees');
    expect(out.length).toBe(1);
    expect(dbQueryMock.mock.calls[0]![1]).toEqual(['fees']);
    expect(dbQueryMock.mock.calls[0]![0]).toContain('display_order');
  });

  it('getCategories converts COUNT(*) text to number', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { category: 'fees', count: '7' },
        { category: 'auth', count: '4' },
      ],
    });
    const out = await settingsService.getCategories();
    expect(out).toEqual([
      { category: 'fees', count: 7 },
      { category: 'auth', count: 4 },
    ]);
  });
});

describe('validateSettingValue', () => {
  it('rejects NaN for numeric', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'number', min_value: null, max_value: null }),
        'banana',
      ),
    ).toThrow(/numeric/);
  });

  it('rejects non-integer when value_type is integer', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'integer' }),
        '3.14',
      ),
    ).toThrow(/whole number/);
  });

  it('accepts valid integer when value_type is integer', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'integer' }),
        '7',
      ),
    ).not.toThrow();
  });

  it('rejects below min for percent', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'percent', min_value: '5', max_value: '20' }),
        '1',
      ),
    ).toThrow(/minimum/);
  });

  it('rejects above max for currency', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'currency', min_value: '100', max_value: '500' }),
        '999',
      ),
    ).toThrow(/maximum/);
  });

  it('accepts in-range numeric', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'number', min_value: '5', max_value: '20' }),
        '10',
      ),
    ).not.toThrow();
  });

  it('rejects boolean that is neither "true" nor "false"', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'boolean' }),
        'yes',
      ),
    ).toThrow(/true or false/);
  });

  it('accepts boolean "true"', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'boolean' }),
        'true',
      ),
    ).not.toThrow();
  });

  it('accepts boolean "false"', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'boolean' }),
        'false',
      ),
    ).not.toThrow();
  });

  it('rejects value not in allowed_values', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'string', allowed_values: ['low', 'medium', 'high'] }),
        'extreme',
      ),
    ).toThrow(/must be one of/);
  });

  it('accepts value in allowed_values', () => {
    expect(() =>
      settingsService.validateSettingValue(
        fakeRow({ value_type: 'string', allowed_values: ['low', 'medium', 'high'] }),
        'medium',
      ),
    ).not.toThrow();
  });
});

describe('updateSetting', () => {
  it('throws 404 when key does not exist in DB', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      settingsService.updateSetting('nope', '5', 'admin'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('writes audit row with correct columns', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] }); // SELECT
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '12' })] }); // UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [] }); // INSERT audit

    await settingsService.updateSetting(
      'service_fee_rate',
      '12',
      'admin-id',
      'tuning',
      '127.0.0.1',
      'jest/1.0',
    );

    const auditCall = dbQueryMock.mock.calls[2]!;
    expect(auditCall[0]).toContain('platform_settings_audit');
    // [setting_id, key, oldValue, newValue, changedBy, reason, ip, ua]
    expect(auditCall[1]).toEqual([
      'row-id',
      'service_fee_rate',
      '10',
      '12',
      'admin-id',
      'tuning',
      '127.0.0.1',
      'jest/1.0',
    ]);
  });

  it('passes null for absent reason / ip / ua', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] });
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '12' })] });
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    await settingsService.updateSetting('service_fee_rate', '12', 'admin');

    const auditCall = dbQueryMock.mock.calls[2]!;
    expect(auditCall[1]).toEqual([
      'row-id',
      'service_fee_rate',
      '10',
      '12',
      'admin',
      null,
      null,
      null,
    ]);
  });

  it('busts the per-key cache on success', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] });
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '12' })] });
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    await settingsService.updateSetting('service_fee_rate', '12', 'admin');

    expect(redisDelMock).toHaveBeenCalledWith('settings:service_fee_rate');
    expect(redisDelMock).toHaveBeenCalledWith('settings:__all__');
  });

  it('rejects validation failure before touching UPDATE/INSERT', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [fakeRow({ value_type: 'number', min_value: '5', max_value: '20' })],
    });
    await expect(
      settingsService.updateSetting('service_fee_rate', '999', 'admin'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).toHaveBeenCalledTimes(1); // only the SELECT
  });

  it('returns the UPDATE-RETURNING row', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] });
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '12', updated_by: 'admin' })] });
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    const updated = await settingsService.updateSetting('service_fee_rate', '12', 'admin');
    expect(updated.value).toBe('12');
    expect(updated.updated_by).toBe('admin');
  });
});

describe('bulkUpdateSettings', () => {
  it('returns empty array for empty input without touching DB', async () => {
    const out = await settingsService.bulkUpdateSettings([], 'admin');
    expect(out).toEqual([]);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('processes each update sequentially and returns all rows', async () => {
    // Two updates; each requires SELECT + UPDATE + INSERT (= 6 queries)
    for (let i = 0; i < 2; i++) {
      dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] });
      dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: String(20 + i) })] });
      dbQueryMock.mockResolvedValueOnce({ rows: [] });
    }
    const out = await settingsService.bulkUpdateSettings(
      [
        { key: 'service_fee_rate', value: '20' },
        { key: 'service_fee_min', value: '21' },
      ],
      'admin',
      'bulk',
    );
    expect(out.length).toBe(2);
    expect(out[0]!.value).toBe('20');
    expect(out[1]!.value).toBe('21');
    expect(dbQueryMock).toHaveBeenCalledTimes(6);
  });

  it('propagates the first failure and stops', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] }); // first SELECT — not found
    await expect(
      settingsService.bulkUpdateSettings(
        [{ key: 'missing', value: 'x' }, { key: 'service_fee_rate', value: '11' }],
        'admin',
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });
});

describe('resetToDefault', () => {
  it('throws 404 if the key does not exist', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      settingsService.resetToDefault('missing', 'admin'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('writes default_value back through updateSetting', async () => {
    // SELECT inside resetToDefault
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '99', default_value: '10' })] });
    // SELECT inside updateSetting
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '99', default_value: '10' })] });
    // UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] });
    // INSERT audit
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    const out = await settingsService.resetToDefault('service_fee_rate', 'admin');
    expect(out.value).toBe('10');
    const updateCall = dbQueryMock.mock.calls[2]!;
    expect(updateCall[1]).toContain('10');
    const auditCall = dbQueryMock.mock.calls[3]!;
    expect(auditCall[1]).toContain('Reset to default');
  });
});

describe('getSettingAuditHistory', () => {
  it('queries by key with default limit 50', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await settingsService.getSettingAuditHistory('service_fee_rate');
    expect(dbQueryMock.mock.calls[0]![1]).toEqual(['service_fee_rate', 50]);
  });

  it('respects an explicit limit', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await settingsService.getSettingAuditHistory('service_fee_rate', 10);
    expect(dbQueryMock.mock.calls[0]![1]).toEqual(['service_fee_rate', 10]);
  });

  it('returns the rows', async () => {
    const audit = { id: 'a1', setting_key: 'service_fee_rate' };
    dbQueryMock.mockResolvedValueOnce({ rows: [audit] });
    const out = await settingsService.getSettingAuditHistory('service_fee_rate');
    expect(out).toEqual([audit]);
  });
});

describe('cache management', () => {
  it('bustCache deletes per-key + all-key', async () => {
    await settingsService.bustCache('service_fee_rate');
    expect(redisDelMock).toHaveBeenCalledWith('settings:service_fee_rate');
    expect(redisDelMock).toHaveBeenCalledWith('settings:__all__');
  });

  it('bustCache swallows redis errors', async () => {
    redisDelMock.mockRejectedValueOnce(new Error('boom'));
    await expect(settingsService.bustCache('service_fee_rate')).resolves.toBeUndefined();
  });

  it('bustAllCache deletes all matching keys when present', async () => {
    redisKeysMock.mockResolvedValueOnce(['settings:a', 'settings:b']);
    await settingsService.bustAllCache();
    expect(redisDelMock).toHaveBeenCalledWith('settings:a', 'settings:b');
  });

  it('bustAllCache no-ops cleanly when no keys match', async () => {
    redisKeysMock.mockResolvedValueOnce([]);
    await settingsService.bustAllCache();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('bustAllCache swallows redis errors', async () => {
    redisKeysMock.mockRejectedValueOnce(new Error('boom'));
    await expect(settingsService.bustAllCache()).resolves.toBeUndefined();
  });
});

describe('getClientConfig', () => {
  it('returns the public client bundle with the expected static fields and resolved settings', async () => {
    // 16 awaits in getClientConfig — just resolve every getSetting* call.
    redisGetMock.mockResolvedValue('10');
    const cfg = await settingsService.getClientConfig();
    expect(cfg.appVersion).toBe('0.1.0');
    expect(cfg.currency).toBe('PHP');
    expect(cfg.currencySymbol).toBe('\u20B1');
    expect(cfg.timezone).toBe('Asia/Manila');
    // Spot-check resolved values
    expect(cfg.serviceFeeRate).toBeCloseTo(0.1, 5);
    expect(cfg.serviceFeeMin).toBe(10);
    expect(cfg.escrowAutoConfirmHours).toBe(10);
    expect(cfg.maxQuotesPerBooking).toBe(10);
  });
});

describe('formatSetting', () => {
  it('redacts value when is_sensitive is true', () => {
    const f = settingsService.formatSetting(fakeRow({ is_sensitive: true, value: 'secret' }));
    expect(f.value).toBe('\u2022\u2022\u2022\u2022\u2022\u2022');
  });

  it('exposes value when is_sensitive is false', () => {
    const f = settingsService.formatSetting(fakeRow({ is_sensitive: false, value: '10' }));
    expect(f.value).toBe('10');
  });

  it('isDefault === true when value matches default_value', () => {
    const f = settingsService.formatSetting(fakeRow({ value: '10', default_value: '10' }));
    expect(f.isDefault).toBe(true);
  });

  it('isDefault === false when value differs from default_value', () => {
    const f = settingsService.formatSetting(fakeRow({ value: '12', default_value: '10' }));
    expect(f.isDefault).toBe(false);
  });

  it('coerces min_value and max_value strings to numbers', () => {
    const f = settingsService.formatSetting(
      fakeRow({ min_value: '5', max_value: '20' }),
    );
    expect(f.minValue).toBe(5);
    expect(f.maxValue).toBe(20);
  });

  it('passes null for null min/max', () => {
    const f = settingsService.formatSetting(
      fakeRow({ min_value: null, max_value: null }),
    );
    expect(f.minValue).toBeNull();
    expect(f.maxValue).toBeNull();
  });

  it('preserves all 1:1 fields verbatim', () => {
    const row = fakeRow({
      id: 'X',
      category: 'auth',
      subcategory: 'otp',
      key: 'otp_length',
      label: 'OTP length',
      description: 'how many digits',
      value_type: 'integer',
      default_value: '6',
      allowed_values: ['4', '6', '8'],
      display_order: 7,
      unit: 'digits',
      is_active: false,
      requires_restart: true,
    });
    const f = settingsService.formatSetting(row);
    expect(f.id).toBe('X');
    expect(f.category).toBe('auth');
    expect(f.subcategory).toBe('otp');
    expect(f.key).toBe('otp_length');
    expect(f.label).toBe('OTP length');
    expect(f.description).toBe('how many digits');
    expect(f.valueType).toBe('integer');
    expect(f.defaultValue).toBe('6');
    expect(f.allowedValues).toEqual(['4', '6', '8']);
    expect(f.displayOrder).toBe(7);
    expect(f.unit).toBe('digits');
    expect(f.isActive).toBe(false);
    expect(f.requiresRestart).toBe(true);
  });
});
