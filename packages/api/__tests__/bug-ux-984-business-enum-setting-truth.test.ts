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

it('Bug UX-984 — database-constrained business enums cannot masquerade as live Admin settings', () => {
  expect(getSettingRuntimeControl('business_account_types')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/database schema/i),
  });
  expect(getSettingRuntimeControl('business_payment_terms')).toMatchObject({
    status: 'held',
    editable: false,
    summary: expect.stringMatching(/due-date calculation/i),
  });
});
