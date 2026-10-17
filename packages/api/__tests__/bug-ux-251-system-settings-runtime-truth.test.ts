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
  // 37 after migration 182 added request_first_booking (D38). D38 Milestone 2
  // adds 14 live controls (7 request keys from 183, 6 job-media keys from 184,
  // request_threads_enabled from 185) and retires max_quotes_per_booking from
  // live to not_connected: 37 - 1 + 14 = 50 live, 12 + 1 = 13 not_connected.
  // D38 Milestone 3 (migration 186) adds 3 live controls: the amber and red
  // request-alert thresholds and the coverage threshold. 50 + 3 = 53 live.
  // Migration 188 (customer review slice P2, D41) adds the two editable
  // invited-testers controls (53 + 2 = 55 live) and the referral and Suki off
  // switches, read-only until Ken decides their rules (31 + 2 = 33 held).
  // D24 Option A (migration 189) adds 6 live address search controls:
  // 55 + 6 = 61 live.
  expect(statuses.filter((status) => status === 'live')).toHaveLength(61);
  expect(statuses.filter((status) => status === 'release_coupled')).toHaveLength(3);
  expect(statuses.filter((status) => status === 'held')).toHaveLength(33);
  expect(statuses.filter((status) => status === 'not_connected')).toHaveLength(13);

  const disconnected = settingsService.getSettingRuntimeControl('jwt_access_expires');
  expect(disconnected).toMatchObject({ status: 'not_connected', editable: false });
  expect(disconnected.summary).toMatch(/deployment configuration/i);

  const held = settingsService.getSettingRuntimeControl('feature_flag.promo_redemption_enabled');
  expect(held).toMatchObject({ status: 'held', editable: false });

  expect(settingsService.getSettingRuntimeControl('guarantee_fund_rate')).toMatchObject({
    status: 'held', editable: false,
  });
  expect(settingsService.getSettingRuntimeControl('bir_filer_tin')).toMatchObject({
    status: 'held', editable: false,
  });
  expect(settingsService.getSettingRuntimeControl('auto_dispatch_enabled')).toMatchObject({
    status: 'held', editable: false,
  });

  const branding = settingsService.getSettingRuntimeControl('brand_color_primary');
  expect(branding).toMatchObject({ status: 'release_coupled', editable: true });
  expect(branding.summary).toMatch(/mobile release and admin redeploy/i);

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
