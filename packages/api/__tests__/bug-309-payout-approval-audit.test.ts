const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (cb: unknown) => dbTransactionMock(cb) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { approvePayout } from '../src/services/payout.service';

it('Bug 309 — payout approval commits the state, operator reason, audit event, and provider notice in one transaction', async () => {
  const queryMock = jest.fn()
    .mockResolvedValueOnce({
      rows: [{ id: 'payout-1', provider_id: 'provider-1', amount: '125000', status: 'approved' }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: jest.Mock }) => unknown) => callback({
    query: queryMock,
  }));

  await expect(approvePayout(
    'payout-1',
    'admin-1',
    'Bank destination and available balance were verified.',
  )).resolves.toMatchObject({ id: 'payout-1', status: 'approved' });

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls[1]?.[0]).toContain("'payout_approved'");
  expect(queryMock.mock.calls[1]?.[1]).toEqual([
    'admin-1',
    'payout-1',
    JSON.stringify({ amount: 125000 }),
    'Bank destination and available balance were verified.',
  ]);
  expect(queryMock.mock.calls[3]?.[0]).toContain('INSERT INTO notifications');
});
