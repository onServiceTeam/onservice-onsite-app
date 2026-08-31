const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getWalletTransactions } from '../src/services/wallet.service';

it('Bug UX-652 — wallet transaction groups are filtered before pagination across the full history', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'refund-1', type: 'refund' }] });

  const result = await getWalletTransactions('wallet-1', 2, 20, 'refund');

  expect(dbQueryMock).toHaveBeenNthCalledWith(1, expect.stringMatching(/type = 'refund'/), ['wallet-1']);
  expect(dbQueryMock).toHaveBeenNthCalledWith(2, expect.stringMatching(/type = 'refund'.*ORDER BY/s), ['wallet-1', 20, 20]);
  expect(result.total).toBe(1);
  expect(result.transactions).toEqual([{ id: 'refund-1', type: 'refund' }]);
});
