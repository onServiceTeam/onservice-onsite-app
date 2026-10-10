const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));

import { forceCompleteBooking } from '../src/services/booking-admin.service';

describe('BUG-PHASE168-01 - booking-admin reasons cap at 5000 chars', () => {
  beforeEach(() => dbTransactionMock.mockReset());

  it('rejects a force-complete reason over 5000 characters before opening a transaction', async () => {
    await expect(
      forceCompleteBooking(
        'b0000000-0000-0000-0000-000000000001',
        'x'.repeat(5001),
        'a0000000-0000-0000-0000-000000000001',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});
