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

import { updateSetting } from '../src/services/settings.service';

it('Bug OPS-235 — legacy commission settings reject direct mutation before opening a transaction', async () => {
  await expect(updateSetting('commission_rate_new', '25', {
    changedBy: 'super-admin-1',
    reason: 'Prospective commission agreement review.',
    expectedUpdatedAt: '2026-09-01T00:00:00.000Z',
  })).rejects.toMatchObject({
    statusCode: 409,
    message: expect.stringContaining('Commission Controls'),
  });

  expect(dbTransactionMock).not.toHaveBeenCalled();
});
