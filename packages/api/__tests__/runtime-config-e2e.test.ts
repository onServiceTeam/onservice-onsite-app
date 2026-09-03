/**
 * Phase 03 — runtime-config end-to-end tests for the settings service.
 *
 * Mocks db + redis directly (NOT the settings.service itself) so we exercise
 * the real fallback chain: Redis → DB → in-memory SETTING_DEFAULTS.
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
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

const FIXED_UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');

function mutationContext(reason = 'Approved runtime setting change.') {
  return {
    changedBy: 'admin-user-id',
    reason,
    expectedUpdatedAt: FIXED_UPDATED_AT.toISOString(),
  };
}

function fakeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'row-id',
    category: 'fees',
    subcategory: null,
    key: 'service_fee_rate',
    label: 'Service Fee Rate',
    description: '',
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
    updated_at: FIXED_UPDATED_AT,
    created_at: new Date(),
    ...overrides,
  };
}

describe('runtime-config-e2e', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
    dbTransactionMock.mockReset();
    redisGetMock.mockReset();
    redisSetMock.mockReset();
    redisDelMock.mockReset();
    redisKeysMock.mockReset();
    redisSetMock.mockResolvedValue('OK');
    redisDelMock.mockResolvedValue(1);
  });

  describe('getSetting fallback chain', () => {
    it('returns cached value on Redis hit (no DB call)', async () => {
      redisGetMock.mockResolvedValueOnce('12');
      const v = await settingsService.getSetting('service_fee_rate');
      expect(v).toBe('12');
      expect(dbQueryMock).not.toHaveBeenCalled();
    });

    it('falls back to DB on cache miss and warms cache', async () => {
      redisGetMock.mockResolvedValueOnce(null);
      dbQueryMock.mockResolvedValueOnce({ rows: [{ value: '11' }] });
      const v = await settingsService.getSetting('service_fee_rate');
      expect(v).toBe('11');
      expect(dbQueryMock).toHaveBeenCalledTimes(1);
      expect(redisSetMock).toHaveBeenCalled();
    });

    it('falls back to SETTING_DEFAULTS when DB row is missing', async () => {
      redisGetMock.mockResolvedValueOnce(null);
      dbQueryMock.mockResolvedValueOnce({ rows: [] });
      const v = await settingsService.getSetting('service_fee_rate');
      expect(v).toBe(settingsService.SETTING_DEFAULTS['service_fee_rate']);
    });

    it('throws 404 when key is unknown and not in defaults', async () => {
      redisGetMock.mockResolvedValueOnce(null);
      dbQueryMock.mockResolvedValueOnce({ rows: [] });
      await expect(settingsService.getSetting('definitely_not_a_real_key'))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateSetting validation', () => {
    it('rejects values below the configured minimum', async () => {
      dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
        const clientQuery = jest.fn().mockResolvedValue({
          rows: [fakeRow({ value_type: 'number', min_value: '5', max_value: '20' })],
          rowCount: 1,
        });
        return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
      });
      await expect(
        settingsService.updateSetting('service_fee_rate', '1', mutationContext()),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects values above the configured maximum', async () => {
      dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
        const clientQuery = jest.fn().mockResolvedValue({
          rows: [fakeRow({ value_type: 'number', min_value: '5', max_value: '20' })],
          rowCount: 1,
        });
        return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
      });
      await expect(
        settingsService.updateSetting('service_fee_rate', '999', mutationContext()),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('updateSetting side effects', () => {
    it('writes audit row and busts cache on success (CRIT-N13: trx-aware)', async () => {
      const lockedRow = fakeRow({ value_type: 'number', min_value: '5', max_value: '20' });
      const txCalls: Array<{ sql: string; params: unknown[] }> = [];
      dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
        const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
          txCalls.push({ sql, params });
          if (/SELECT \*/.test(sql) && /FOR UPDATE/.test(sql)) {
            return { rows: [lockedRow], rowCount: 1 };
          }
          if (/UPDATE platform_settings/.test(sql)) {
            return { rows: [fakeRow({ value_type: 'number', value: '12' })], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (cb as any)({ query: clientQuery });
      });

      await settingsService.updateSetting(
        'service_fee_rate',
        '12',
        mutationContext('Approved fee tuning change.'),
      );

      // The audit insert is inside the trx, not in dbQueryMock.
      const auditCall = txCalls.find((c) => c.sql.includes('platform_settings_audit'));
      expect(auditCall).toBeDefined();
      expect(redisDelMock).toHaveBeenCalled();
    });
  });

  describe('resetToDefault', () => {
    it('writes the default_value back to the row (CRIT-N13: trx-aware)', async () => {
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

      await settingsService.resetToDefault(
        'service_fee_rate',
        mutationContext('Restore the approved platform default.'),
      );
      // The UPDATE call inside the trx must have been called with default_value '10'.
      const updateCall = txCalls.find((c) => /UPDATE platform_settings/.test(c.sql));
      expect(updateCall).toBeDefined();
      expect(updateCall!.params).toContain('10');
    });
  });
});
