const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cancelBookingAsAdmin } from '../src/services/booking-admin.service';

it('Bug UX-713 — admin cancellation cannot relabel a paid-out booking after settlement', async () => {
  // S1-8: the state is decided on the locked row inside the transaction.
  const clientQuery = jest.fn().mockResolvedValueOnce({
    rowCount: 1,
    rows: [{ id: 'booking-1', status: 'paid_out', escrow_status: 'released' }],
  });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
    callback({ query: clientQuery }));

  await expect(cancelBookingAsAdmin(
    'booking-1',
    'Support reviewed the settled booking.',
    'admin-1',
    24,
    false,
    false,
  )).rejects.toMatchObject({
    statusCode: 409,
    message: expect.stringMatching(/canonical dispute or settlement workflow/i),
  });
  // Only the lock ran: no status update, no money and no audit row.
  expect(clientQuery).toHaveBeenCalledTimes(1);
  expect(clientQuery.mock.calls[0]![0]).toMatch(/SELECT \* FROM bookings WHERE id = \$1 FOR UPDATE/);
  expect(dbQueryMock).not.toHaveBeenCalled();
});
