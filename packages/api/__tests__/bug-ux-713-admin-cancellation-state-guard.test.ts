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
  dbQueryMock.mockResolvedValueOnce({
    rowCount: 1,
    rows: [{ id: 'booking-1', status: 'paid_out', escrow_status: 'released' }],
  });

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
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
