// §35b — when a dispute resolution's escrow refund failed, the failure must
// not be swallowed. Pre-fix the 3 dispute.service paths logged + dropped the
// error, leaving the dispute 'resolved' while no money moved and nothing
// scheduled to reconcile it. §35b then enqueued a whole-refund retry.
//
// MC-03 (2026-10-10) replaces that enqueue: the provider-accept refund now
// runs INSIDE the resolution transaction (repair contract K01), so a refund
// that cannot be made rolls the acceptance back and the provider sees the
// error, and a whole-refund retry (which could debit escrow twice) is never
// queued. After commit only the payment-record step runs; it queues its own
// payment-only retry on failure. The real-database proofs are FIN-013 to
// FIN-015; this file pins the order of the provider-accept path.

const enqueueRetryMock = jest.fn();
jest.mock('../src/services/gateway-retry.service', () => ({
  enqueueRetry: (...a: unknown[]) => enqueueRetryMock(...a),
}));

const refundInTransactionMock = jest.fn();
const paymentStepMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrow: jest.fn(),
  refundFromEscrowInTransaction: (...a: unknown[]) => refundInTransactionMock(...a),
  processEscrowRefundPaymentStep: (...a: unknown[]) => paymentStepMock(...a),
  releasePartialEscrow: jest.fn(),
  releaseEscrow: jest.fn(),
}));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: jest.fn().mockResolvedValue(undefined),
}));

import { db } from '../src/models/db';
import { addProviderResponse } from '../src/services/dispute.service';

const mockQuery = db.query as jest.Mock;
const mockTransaction = db.transaction as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset();
  mockTransaction.mockReset();
  enqueueRetryMock.mockReset();
  refundInTransactionMock.mockReset();
  paymentStepMock.mockReset();
});

function primeAccept() {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'open', provider_response: null, booking_id: 'b1' }] }) // dispute
    .mockResolvedValueOnce({ rows: [{ id: 'b1', customer_id: 'c1', provider_id: 'p1', status: 'completed_by_provider', escrow_status: 'held', total_amount: 10000 }] }) // booking
    .mockResolvedValueOnce({ rows: [{ user_id: 'puser' }] }); // provider owner
  const clientQuery = jest.fn(async (sql: string) => {
    if (/FROM bookings WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [{ id: 'b1' }], rowCount: 1 };
    if (/UPDATE disputes SET/.test(sql)) return { rows: [{ id: 'd1' }], rowCount: 1 };
    if (/UPDATE bookings SET/.test(sql)) return { rows: [], rowCount: 1 };
    if (/INSERT INTO notifications/.test(sql)) return { rows: [{ id: 'notification-1' }], rowCount: 1 };
    if (/SELECT \* FROM disputes/.test(sql)) return { rows: [{ id: 'd1', status: 'resolved' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  let committed = false;
  mockTransaction.mockImplementationOnce(async (cb: (c: { query: typeof clientQuery }) => unknown) => {
    const result = await cb({ query: clientQuery });
    committed = true;
    return result;
  });
  return { clientQuery, committed: () => committed };
}

describe('§35b / MC-03 — a provider-accepted dispute refund commits with the resolution', () => {
  it('addProviderResponse(accept): a refund that cannot be made rolls the acceptance back and queues no whole-refund retry', async () => {
    const run = primeAccept();
    refundInTransactionMock.mockRejectedValueOnce(new Error('Refund exceeds this booking\'s remaining escrow (0 centavos).'));

    await expect(addProviderResponse('d1', 'puser', 'I accept', 'accept'))
      .rejects.toThrow(/remaining escrow/);

    expect(run.committed()).toBe(false);
    expect(enqueueRetryMock).not.toHaveBeenCalled();
    expect(paymentStepMock).not.toHaveBeenCalled();
  });

  it('addProviderResponse(accept): the refund runs on the transaction client and only the payment-record step runs after commit', async () => {
    const run = primeAccept();
    refundInTransactionMock.mockResolvedValueOnce({ remainingEscrowCentavos: 0, paymentMethod: 'wallet', customerWalletCredited: true });
    paymentStepMock.mockResolvedValueOnce(undefined);

    await addProviderResponse('d1', 'puser', 'I accept', 'accept');

    expect(run.committed()).toBe(true);
    // The guarded dispute update (which locks the dispute) runs first, then
    // the booking lock: the dispute-then-booking order every dispute path uses.
    const sqls = run.clientQuery.mock.calls.map(([sql]) => sql as string);
    expect(sqls[0]).toMatch(/UPDATE disputes SET[\s\S]*AND status = 'open'[\s\S]*AND provider_response IS NULL/);
    expect(sqls[1]).toMatch(/FROM bookings WHERE id = \$1 FOR UPDATE/);
    expect(refundInTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: run.clientQuery }), 'b1', 10000, 'Provider accepted dispute — full refund',
    );
    expect(paymentStepMock).toHaveBeenCalledWith('b1', 10000, 'Provider accepted dispute — full refund', 'wallet', 'd1');
    expect(enqueueRetryMock).not.toHaveBeenCalled();
  });
});
