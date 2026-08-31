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
import type { SettingMutationContext, SettingRow } from '../src/services/settings.service';

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

function mutationContext(overrides: Partial<SettingMutationContext> = {}): SettingMutationContext {
  return {
    changedBy: 'admin-id',
    reason: 'Approved operational settings change.',
    expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    ipAddress: '127.0.0.1',
    userAgent: 'jest/1.0',
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

it('Bug UX-797 — every live cancellation refund knob is frozen under the E09 cross-source hold', () => {
  const keys = [
    'cancel_refund_over_24h',
    'cancel_refund_2_to_24h',
    'cancel_refund_1_to_2h',
    'cancel_refund_30min_to_1h',
    'cancel_refund_under_30min',
    'cancel_refund_provider_arrived',
    'cancel_refund_customer_noshow',
  ];

  for (const key of keys) {
    expect(settingsService.getSettingRuntimeControl(key)).toMatchObject({
      status: 'held',
      label: 'Launch hold',
      editable: false,
    });
  }
});

it('Bug UX-800 — a forged cancellation setting update is rejected before any money control changes', async () => {
  dbQueryMock.mockResolvedValue({
    rows: [fakeRow({
      category: 'cancellation',
      key: 'cancel_refund_2_to_24h',
      value: '100',
      default_value: '100',
      unit: '%',
    })],
  });

  await expect(settingsService.updateSetting(
    'cancel_refund_2_to_24h',
    '75',
    mutationContext({
      changedBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reason: 'Attempt to align the customer wording.',
    }),
  )).rejects.toMatchObject({ statusCode: 409 });
  expect(dbTransactionMock).not.toHaveBeenCalled();
});

describe('SETTING_DEFAULTS exact-value snapshot (kills string-literal mutants)', () => {
  // Every value below must match the active setting's migration-seeded
  // default. Stryker mutates each string literal and these assertions kill
  // those mutants.
  const expected: Record<string, string> = {
    commission_rate_founding: '10',
    commission_rate_new: '15',
    commission_rate_verified: '13',
    commission_rate_pro: '11',
    commission_rate_elite: '9',
    service_fee_rate: '0',
    service_fee_min: '0',
    service_fee_max: '50000',
    guarantee_fund_rate: '1.5',
    vat_rate: '12',
    tip_max_amount_cents: '500000',
    addon_price_max_cents: '5000000',
    escrow_auto_confirm_hours: '24',
    escrow_dispute_window_hours: '48',
    minimum_payment_amount: '10000',
    minimum_withdrawal_amount: '10000',
    withdrawal_processing_days: '3',
    surge_multiplier_min: '1.0',
    surge_multiplier_max: '5.0',
    reconciliation_alert_threshold_centavos: '10000',
    aml_large_transaction_threshold_centavos: '50000000',
    'feature_flag.promo_redemption_enabled': 'false',
    'feature_flag.ab_testing_enabled': 'false',
    marketing_channels: JSON.stringify([
      'facebook_ads', 'google_ads', 'billboard', 'kiosk', 'influencer',
      'sms', 'email', 'referral', 'other',
    ]),
    matching_tier_bonus: JSON.stringify({
      founding: 0.5, new: 0.0, verified: 0.25, pro: 0.5, elite: 1.0,
    }),
    fraud_pattern_dispute_count_threshold: '5',
    fraud_pattern_window_days: '30',
    fraud_pattern_favor_provider_rate: '0.80',
    noshow_auto_resolve_window_minutes: '30',
    bir_filer_company_name: '__UNSET__',
    bir_filer_tin: '__UNSET__',
    bir_filer_address: '__UNSET__',
    bir_filer_ptu_number: '__UNSET__',
    bir_filer_vat_status: 'VAT-Registered',
    cancel_refund_over_24h: '100',
    cancel_refund_2_to_24h: '100',
    cancel_refund_1_to_2h: '90',
    cancel_refund_30min_to_1h: '80',
    cancel_refund_under_30min: '70',
    cancel_refund_provider_arrived: '50',
    cancel_refund_customer_noshow: '0',
    // SiguradoShield protection-coverage defaults removed in Phase 14 D04
    // (Bug 1168 + Bug 538 + decision file D04-siguradoshield.md). Do NOT
    // reintroduce max_property_damage_coverage / max_theft_coverage /
    // max_injury_coverage / damage_deductible_* / claim_window_hours /
    // auto_suspend_claim_count / provider_recovery_rate without lifting
    // LAUNCH-LIMITATIONS §23.
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
    change_order_approval_expiry_hours: '24',
    recurring_auto_charge_max_consecutive_failures: '3',
    rate_limit_window_ms: '900000',
    rate_limit_max_requests: '100',
    suspicious_ip_threshold: '10',
    captcha_threshold: '3',
    refresh_token_strict_fingerprint: 'false',
    allowed_image_mime_types: 'image/jpeg,image/png,image/webp',
    business_account_types: 'office,condo_management,restaurant,hotel,retail,school,hospital,other',
    business_payment_terms: 'net_15,net_30,net_60',
    suki_tiers: JSON.stringify({
      new: { minBookings: 0, pointsPerPeso: 1, discount: 0 },
      regular: { minBookings: 3, pointsPerPeso: 1, discount: 0 },
      suki: { minBookings: 10, pointsPerPeso: 2, discount: 5 },
      super_suki: { minBookings: 25, pointsPerPeso: 3, discount: 10 },
    }),
    suki_points_to_peso_rate: '100',
    brand_color_primary: '#003D9B',
    brand_color_secondary: '#0052CC',
    brand_color_accent: '#FE8A00',
    map_tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    map_tile_attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    map_tile_api_key: '',
    auto_dispatch_enabled: 'true',
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
    expect(v).toBe('0'); // customer service fee removed (mig 137); default is now 0
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
      'settings:__all_active__',
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
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });
    await expect(
      settingsService.updateSetting('nope', '5', mutationContext()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // The locked SELECT, UPDATE, and audit INSERT all use one transaction client.
  function setupUpdateTrx(
    selectRow: SettingRow,
    updatedRow: SettingRow,
  ): { txCalls: Array<{ sql: string; params: unknown[] }>; clientQuery: jest.Mock } {
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
      txCalls.push({ sql, params });
      if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [selectRow], rowCount: 1 };
      }
      if (/UPDATE platform_settings/.test(sql)) {
        return { rows: [updatedRow], rowCount: 1 };
      }
      if (/INSERT INTO platform_settings_audit/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    return { txCalls, clientQuery };
  }

  it('writes audit row with correct columns inside the locked transaction', async () => {
    const { txCalls } = setupUpdateTrx(
      fakeRow({ value: '10' }),
      fakeRow({ value: '12' }),
    );

    await settingsService.updateSetting(
      'service_fee_rate',
      '12',
      mutationContext({ reason: 'Approved fee tuning change.' }),
    );

    const auditCall = txCalls.find((c) => c.sql.includes('platform_settings_audit'));
    expect(auditCall).toBeDefined();
    expect(auditCall!.params).toEqual([
      'row-id',
      'service_fee_rate',
      '10',
      '12',
      'admin-id',
      'Approved fee tuning change.',
      '127.0.0.1',
      'jest/1.0',
    ]);
  });

  it('passes null for absent optional network evidence', async () => {
    const { txCalls } = setupUpdateTrx(
      fakeRow({ value: '10' }),
      fakeRow({ value: '12' }),
    );

    await settingsService.updateSetting(
      'service_fee_rate',
      '12',
      mutationContext({ ipAddress: undefined, userAgent: undefined }),
    );

    const auditCall = txCalls.find((c) => c.sql.includes('platform_settings_audit'));
    expect(auditCall).toBeDefined();
    expect(auditCall!.params).toEqual([
      'row-id',
      'service_fee_rate',
      '10',
      '12',
      'admin-id',
      'Approved operational settings change.',
      null,
      null,
    ]);
  });

  it('busts the per-key cache on success', async () => {
    setupUpdateTrx(fakeRow({ value: '10' }), fakeRow({ value: '12' }));

    await settingsService.updateSetting('service_fee_rate', '12', mutationContext());

    expect(redisDelMock).toHaveBeenCalledWith('settings:service_fee_rate');
    expect(redisDelMock).toHaveBeenCalledWith('settings:__all_active__');
  });

  it('rejects validation failure before touching UPDATE/INSERT', async () => {
    const { txCalls } = setupUpdateTrx(
      fakeRow({ value_type: 'number', min_value: '5', max_value: '20' }),
      fakeRow({ value: '999' }),
    );
    await expect(
      settingsService.updateSetting('service_fee_rate', '999', mutationContext()),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCalls).toHaveLength(1);
    expect(txCalls[0]!.sql).toMatch(/FOR UPDATE/);
  });

  it('returns the UPDATE-RETURNING row (CRIT-N13: inside transaction)', async () => {
    setupUpdateTrx(
      fakeRow({ value: '10' }),
      fakeRow({ value: '12', updated_by: 'admin' }),
    );

    const updated = await settingsService.updateSetting('service_fee_rate', '12', mutationContext());
    expect(updated.value).toBe('12');
    expect(updated.updated_by).toBe('admin');
  });
});

describe('bulkUpdateSettings', () => {
  it('returns empty array for empty input without touching DB', async () => {
    const out = await settingsService.bulkUpdateSettings([], {
      changedBy: 'admin',
      reason: 'No-op settings batch test.',
    });
    expect(out).toEqual([]);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('MED-N106 — processes all updates inside a SINGLE outer transaction (atomic)', async () => {
    // MED-N106 fix: pre-fix bulkUpdateSettings looped per-key calling
    // updateSetting (each its own trx) — partial state on mid-batch
    // failure. Post-fix: one outer transaction locks every row before
    // validation, then wraps every UPDATE + audit INSERT.
    const lockedRows = [
      fakeRow({ id: 'rate-id', key: 'service_fee_rate', value: '10' }),
      fakeRow({ id: 'min-id', key: 'service_fee_min', value: '10' }),
    ];
    let updateCount = 0;
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
          return { rows: lockedRows, rowCount: 2 };
        }
        if (/UPDATE platform_settings/.test(sql)) {
          updateCount++;
          return { rows: [fakeRow({ value: String(params[0]) })], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const out = await settingsService.bulkUpdateSettings(
      [
        { key: 'service_fee_rate', value: '20', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
        { key: 'service_fee_min', value: '21', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      { changedBy: 'admin', reason: 'Approved bulk settings change.' },
    );
    expect(out.length).toBe(2);
    expect(out[0]!.value).toBe('20');
    expect(out[1]!.value).toBe('21');
    expect(dbQueryMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(updateCount).toBe(2);
  });

  it('MED-N106 — locked validation rejects unknown keys before any write', async () => {
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });
    await expect(
      settingsService.bulkUpdateSettings(
        [
          { key: 'missing', value: 'x', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
          { key: 'service_fee_rate', value: '11', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
        ],
        { changedBy: 'admin', reason: 'Approved bulk settings change.' },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  });
});

describe('resetToDefault', () => {
  it('throws 404 if the key does not exist', async () => {
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });
    await expect(
      settingsService.resetToDefault('missing', mutationContext()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('writes the locked default value and preserves reset audit context', async () => {
    const lockedRow = fakeRow({ value: '99', default_value: '10' });
    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
          return { rows: [lockedRow], rowCount: 1 };
        }
        if (/UPDATE platform_settings/.test(sql)) {
          return { rows: [fakeRow({ value: '10' })], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    const out = await settingsService.resetToDefault(
      'service_fee_rate',
      mutationContext({ reason: 'Restore the approved platform default.' }),
    );
    expect(out.value).toBe('10');
    const updateCall = txCalls.find((c) => /UPDATE platform_settings/.test(c.sql));
    expect(updateCall).toBeDefined();
    expect(updateCall!.params).toContain('10');
    const auditCall = txCalls.find((c) => c.sql.includes('platform_settings_audit'));
    expect(auditCall).toBeDefined();
    expect(auditCall!.params).toContain('Reset to default: Restore the approved platform default.');
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
    expect(redisDelMock).toHaveBeenCalledWith('settings:__all_active__');
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
    // MED-N107 — getClientConfig now does ONE bulk SELECT after the
    // feature_flag SELECT. Mock both in order.
    dbQueryMock.mockReset();
    dbQueryMock.mockResolvedValueOnce({ rows: [] }); // feature flags
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { key: 'service_fee_rate', value: '10' },
        { key: 'service_fee_min', value: '10' },
        { key: 'escrow_auto_confirm_hours', value: '10' },
        { key: 'max_quotes_per_booking', value: '10' },
      ],
    });
    const cfg = await settingsService.getClientConfig();
    expect(cfg.appVersion).toBe('0.1.0');
    expect(cfg.currency).toBe('PHP');
    expect(cfg.currencySymbol).toBe('\u20B1');
    expect(cfg.timezone).toBe('Asia/Manila');
    // MED-N107 \u2014 bulk SELECT was the SECOND db.query call.
    const bulkSql = dbQueryMock.mock.calls[1]![0] as string;
    expect(bulkSql).toMatch(/key = ANY\(\$1::text\[\]\)/);
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
