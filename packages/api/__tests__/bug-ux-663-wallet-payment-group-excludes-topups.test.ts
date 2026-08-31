const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getWalletTransactions } from '../src/services/wallet.service';

it('Bug UX-663 — the wallet payment group excludes unlinked top-up ledger entries', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'booking-payment-1', type: 'payment', booking_id: 'booking-1' }] });

  await getWalletTransactions('wallet-1', 1, 20, 'payment');

  expect(dbQueryMock).toHaveBeenNthCalledWith(
    1,
    expect.stringMatching(/type IN \('payment', 'escrow_hold'\) AND booking_id IS NOT NULL/),
    ['wallet-1'],
  );
  expect(dbQueryMock).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(/type IN \('payment', 'escrow_hold'\) AND booking_id IS NOT NULL.*ORDER BY/s),
    ['wallet-1', 20, 0],
  );
});
