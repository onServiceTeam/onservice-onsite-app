const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));

jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));

import { bulkUpdateSettings } from '../src/services/settings.service';

it('Bug UX-835 — one bulk request cannot mutate and audit the same setting key twice', async () => {
  const expectedUpdatedAt = '2026-01-01T00:00:00.000Z';

  await expect(bulkUpdateSettings(
    [
      { key: 'service_fee_rate', value: '11', expectedUpdatedAt },
      { key: 'service_fee_rate', value: '13', expectedUpdatedAt },
    ],
    { changedBy: 'admin-1', reason: 'Approved duplicate-key rejection test.' },
  )).rejects.toMatchObject({ statusCode: 400 });

  expect(dbTransactionMock).not.toHaveBeenCalled();
});
