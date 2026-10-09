const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));

import { updateSetting } from '../src/services/settings.service';

it('Bug UX-843 — unresolved money, tax, and dispatch controls cannot be changed from System Settings', async () => {
  const context = {
    changedBy: 'admin-1',
    reason: 'Attempted change during launch review.',
    expectedUpdatedAt: '2026-08-31T00:00:00.000Z',
  };

  for (const key of ['guarantee_fund_rate', 'bir_filer_tin', 'auto_dispatch_enabled']) {
    await expect(updateSetting(key, 'changed', context)).rejects.toMatchObject({ statusCode: 409 });
  }
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
