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

it('Bug UX-994 — retroactive change-order expiry cannot remain an editable live setting', () => {
  expect(getSettingRuntimeControl('change_order_approval_expiry_hours')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/already approved.*E61.*own prospective expiry timestamp/i),
  });
});
