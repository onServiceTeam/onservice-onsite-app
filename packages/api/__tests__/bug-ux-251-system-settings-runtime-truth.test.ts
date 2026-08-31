const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));

jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
}));

import * as settingsService from '../src/services/settings.service';

it('Bug UX-251 — disconnected and launch-held settings are reported and enforced as read-only', async () => {
  const statuses = Object.keys(settingsService.SETTING_DEFAULTS).map(
    (key) => settingsService.getSettingRuntimeControl(key).status,
  );
  expect(statuses.filter((status) => status === 'live')).toHaveLength(53);
  expect(statuses.filter((status) => status === 'held')).toHaveLength(10);
  expect(statuses.filter((status) => status === 'not_connected')).toHaveLength(12);

  const disconnected = settingsService.getSettingRuntimeControl('jwt_access_expires');
  expect(disconnected).toMatchObject({ status: 'not_connected', editable: false });
  expect(disconnected.summary).toMatch(/deployment configuration/i);

  const held = settingsService.getSettingRuntimeControl('feature_flag.promo_redemption_enabled');
  expect(held).toMatchObject({ status: 'held', editable: false });

  const aml = settingsService.getSettingRuntimeControl('aml_large_transaction_threshold_centavos');
  expect(aml).toMatchObject({ status: 'live', editable: true });
  expect(aml.summary).toMatch(/internal compliance-review hold/i);

  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'setting-1', key: 'jwt_access_expires', value: '15m', default_value: '15m',
      value_type: 'string', min_value: null, max_value: null, allowed_values: null,
    }],
  });

  await expect(
    settingsService.updateSetting('jwt_access_expires', '30m', {
      changedBy: 'admin-1',
      reason: 'Approved token lifetime change.',
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
