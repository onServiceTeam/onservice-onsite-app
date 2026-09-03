const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({}));

import { getCustomerPayments } from '../src/services/customer-admin.service';

it('Bug OPS-429 - exact wallet evidence is scoped by both customer ownership and transaction ID', async () => {
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const transactionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ available: '12500', pending: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: transactionId,
      type: 'adjustment',
      amount: 12500,
      balance_after: 12500,
      description: 'Service recovery credit',
      booking_id: null,
      created_at: new Date('2026-09-03T06:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const result = await getCustomerPayments(customerId, transactionId);

  expect(result.recentTransactions).toEqual([
    expect.objectContaining({ id: transactionId, amount: 12500 }),
  ]);
  expect(String(dbQueryMock.mock.calls[1]?.[0])).toContain(
    "w.user_id = $1 AND w.type = 'customer' AND wt.id = $2",
  );
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual([customerId, transactionId]);
});
