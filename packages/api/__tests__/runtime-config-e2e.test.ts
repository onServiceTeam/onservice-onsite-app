/**
 * Phase 03 — runtime-config end-to-end tests for the settings service.
 *
 * Mocks db + redis directly (NOT the settings.service itself) so we exercise
 * the real fallback chain: Redis → DB → in-memory SETTING_DEFAULTS.
 */

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
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
    updated_at: new Date(),
    created_at: new Date(),
    ...overrides,
  };
}

describe('runtime-config-e2e', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
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
      dbQueryMock.mockResolvedValueOnce({
        rows: [fakeRow({ value_type: 'number', min_value: '5', max_value: '20' })],
      });
      await expect(
        settingsService.updateSetting('service_fee_rate', '1', 'admin-user-id'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects values above the configured maximum', async () => {
      dbQueryMock.mockResolvedValueOnce({
        rows: [fakeRow({ value_type: 'number', min_value: '5', max_value: '20' })],
      });
      await expect(
        settingsService.updateSetting('service_fee_rate', '999', 'admin-user-id'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('updateSetting side effects', () => {
    it('writes audit row and busts cache on success', async () => {
      // SELECT current
      dbQueryMock.mockResolvedValueOnce({
        rows: [fakeRow({ value_type: 'number', min_value: '5', max_value: '20' })],
      });
      // UPDATE
      dbQueryMock.mockResolvedValueOnce({
        rows: [fakeRow({ value_type: 'number', value: '12' })],
      });
      // INSERT audit
      dbQueryMock.mockResolvedValueOnce({ rows: [] });

      await settingsService.updateSetting('service_fee_rate', '12', 'admin-user-id', 'tuning');

      // First call: SELECT, second: UPDATE, third: INSERT audit
      expect(dbQueryMock).toHaveBeenCalledTimes(3);
      const auditCall = dbQueryMock.mock.calls[2]![0] as string;
      expect(auditCall).toContain('platform_settings_audit');
      expect(redisDelMock).toHaveBeenCalled();
    });
  });

  describe('resetToDefault', () => {
    it('writes the default_value back to the row', async () => {
      // SELECT in resetToDefault
      dbQueryMock.mockResolvedValueOnce({
        rows: [fakeRow({ value: '99', default_value: '10' })],
      });
      // SELECT inside updateSetting
      dbQueryMock.mockResolvedValueOnce({
        rows: [fakeRow({ value: '99', default_value: '10' })],
      });
      // UPDATE
      dbQueryMock.mockResolvedValueOnce({ rows: [fakeRow({ value: '10' })] });
      // INSERT audit
      dbQueryMock.mockResolvedValueOnce({ rows: [] });

      await settingsService.resetToDefault('service_fee_rate', 'admin-user-id');
      // The UPDATE call (3rd) must have been called with default_value '10'
      const updateCall = dbQueryMock.mock.calls[2]!;
      expect(updateCall[1]).toContain('10');
    });
  });
});
