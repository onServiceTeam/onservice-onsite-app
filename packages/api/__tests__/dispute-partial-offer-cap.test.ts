// Audit fix — a provider's partial-refund offer must never exceed the booking
// total. Without the cap, an oversized offer (once accepted) issues a real
// refund larger than what the customer paid and drains the shared escrow pool.
// Behavioral test of addProviderResponse with the db layer mocked.

jest.mock('../src/services/escrow.service', () => ({ refundFromEscrow: jest.fn() }));
jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: jest.fn(async (cb: (c: { query: jest.Mock }) => unknown) => cb({ query: jest.fn() })),
  },
}));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: jest.fn().mockResolvedValue(undefined),
}));

import { db } from '../src/models/db';
import { addProviderResponse } from '../src/services/dispute.service';

const mockQuery = db.query as jest.Mock;
const mockTransaction = db.transaction as jest.Mock;

function primeLookups(totalAmount: number): void {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'open', provider_response: null, booking_id: 'b1' }] }) // dispute
    .mockResolvedValueOnce({ rows: [{ id: 'b1', customer_id: 'c1', provider_id: 'p1', status: 'in_progress', escrow_status: 'held', total_amount: totalAmount }] }) // booking
    .mockResolvedValueOnce({ rows: [{ user_id: 'puser' }] }); // provider owner lookup
}

beforeEach(() => {
  mockQuery.mockReset();
  mockTransaction.mockReset();
  mockTransaction.mockImplementation(async (cb: (c: { query: jest.Mock }) => unknown) => cb({ query: jest.fn() }));
});

describe('Dispute partial offer — amount cannot exceed booking total', () => {
  it('rejects a partial offer larger than the booking total', async () => {
    primeLookups(10000); // booking total = ₱100.00
    await expect(
      addProviderResponse('d1', 'puser', 'Here is a partial refund', 'partial_offer', 50000),
    ).rejects.toThrow(/cannot exceed the booking total/i);
  });

  it('allows a partial offer within the booking total', async () => {
    primeLookups(10000);
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // UPDATE disputes ...
      .mockResolvedValueOnce({ rows: [{ id: 'notification-1' }] }) // INSERT notification
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'open', refund_amount: 5000 }] }); // SELECT * returning the updated row
    mockTransaction.mockImplementationOnce(async (cb: (c: { query: jest.Mock }) => unknown) => cb({ query: clientQuery }));

    const res = await addProviderResponse('d1', 'puser', 'Half back', 'partial_offer', 5000);
    expect(res).toBeTruthy();
    expect(clientQuery).toHaveBeenCalled();
  });
});
