jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getSettingRuntimeControl } from '../src/services/settings.service';

it('Bug UX-996 — inconsistent NBI expiry enforcement cannot remain an editable live setting', () => {
  expect(getSettingRuntimeControl('nbi_expiry_warning_days')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/one notified flag.*skipped at expiry.*auto-suspended.*E62/i),
  });
});
