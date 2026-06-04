// §35b — when a dispute resolution's escrow refund fails, the failure must be
// enqueued for the gateway-retry worker (matching the canonical admin path),
// NOT swallowed. Pre-fix the 3 dispute.service paths logged + dropped the
// error, leaving the dispute 'resolved' while no money moved and nothing
// scheduled to reconcile it.

const enqueueRetryMock = jest.fn();
jest.mock('../src/services/gateway-retry.service', () => ({
  enqueueRetry: (...a: unknown[]) => enqueueRetryMock(...a),
}));

const refundFromEscrowMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrow: (...a: unknown[]) => refundFromEscrowMock(...a),
  releasePartialEscrow: jest.fn(),
  releaseEscrow: jest.fn(),
}));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { addProviderResponse } from '../src/services/dispute.service';

const mockQuery = db.query as jest.Mock;
const mockTransaction = db.transaction as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset();
  mockTransaction.mockReset();
  enqueueRetryMock.mockReset();
  refundFromEscrowMock.mockReset();
});

describe('§35b — dispute refund failure is enqueued for retry, not swallowed', () => {
  it('addProviderResponse(accept): refund failure enqueues a refund_from_escrow retry', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'open', provider_response: null, booking_id: 'b1' }] }) // dispute
      .mockResolvedValueOnce({ rows: [{ id: 'b1', customer_id: 'c1', provider_id: 'p1', status: 'in_progress', escrow_status: 'held', total_amount: 10000 }] }) // booking
      .mockResolvedValueOnce({ rows: [{ user_id: 'puser' }] }); // provider owner

    // The trx flips statuses and returns the updated dispute row.
    mockTransaction.mockImplementationOnce(async (cb: (c: { query: jest.Mock }) => unknown) => {
      const clientQuery = jest.fn()
        .mockResolvedValueOnce({}) // UPDATE disputes
        .mockResolvedValueOnce({}) // UPDATE bookings
        .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'resolved' }] }); // SELECT *
      return cb({ query: clientQuery });
    });

    // Post-commit escrow refund FAILS.
    refundFromEscrowMock.mockRejectedValueOnce(new Error('PayMongo 502'));

    const res = await addProviderResponse('d1', 'puser', 'I accept', 'accept');

    // Resolution still returns (durable state committed)...
    expect(res).toBeTruthy();
    // ...but the failed refund was enqueued for retry, not dropped.
    expect(enqueueRetryMock).toHaveBeenCalledTimes(1);
    const arg = enqueueRetryMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.actionType).toBe('refund_from_escrow');
    expect(arg.bookingId).toBe('b1');
    expect(arg.amountCentavos).toBe(10000);
  });

  it('addProviderResponse(accept): a SUCCESSFUL refund does not enqueue anything', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'open', provider_response: null, booking_id: 'b1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'b1', customer_id: 'c1', provider_id: 'p1', status: 'in_progress', escrow_status: 'held', total_amount: 10000 }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'puser' }] });
    mockTransaction.mockImplementationOnce(async (cb: (c: { query: jest.Mock }) => unknown) => {
      const clientQuery = jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'resolved' }] });
      return cb({ query: clientQuery });
    });
    refundFromEscrowMock.mockResolvedValueOnce(undefined);

    await addProviderResponse('d1', 'puser', 'I accept', 'accept');
    expect(enqueueRetryMock).not.toHaveBeenCalled();
  });
});
