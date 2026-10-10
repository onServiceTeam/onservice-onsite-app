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

import { bulkUpdateSettings, resetToDefault, updateSetting } from '../src/services/settings.service';

it('Bug UX-834 — every settings mutation rejects a missing or superficial audit reason before opening a transaction', async () => {
  const expectedUpdatedAt = '2026-01-01T00:00:00.000Z';
  const outcomes = await Promise.allSettled([
    updateSetting('service_fee_rate', '11', {
      changedBy: 'admin-1',
      reason: '',
      expectedUpdatedAt,
    }),
    resetToDefault('service_fee_rate', {
      changedBy: 'admin-1',
      reason: 'short',
      expectedUpdatedAt,
    }),
    bulkUpdateSettings(
      [{ key: 'service_fee_rate', value: '11', expectedUpdatedAt }],
      { changedBy: 'admin-1', reason: 'tiny' },
    ),
  ]);

  expect(outcomes).toEqual([
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 400 }) }),
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 400 }) }),
    expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ statusCode: 400 }) }),
  ]);
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
