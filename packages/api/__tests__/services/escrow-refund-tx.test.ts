// Phase 14 Dispatch 06 — Bug 71.
// refundBookingEscrow must do escrow refund + admin_actions audit
// inside ONE db.transaction. Pre-D06 the escrow refund ran in
// escrowService.refundFromEscrow's internal transaction, then the
// admin_actions audit ran in a separate db.query — if the audit
// failed, the customer wallet had been credited without an audit trail.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/services/escrow.service', () => ({
  refundFromEscrowInTransaction: jest.fn(),
  refundFromEscrow: jest.fn(),
  releaseEscrowInTransaction: jest.fn(),
  releaseEscrow: jest.fn(),
  handleCancellationInTransaction: jest.fn(),
  handleCancellation: jest.fn(),
  releasePartialEscrowInTransaction: jest.fn(),
  releasePartialEscrow: jest.fn(),
  holdInEscrow: jest.fn(),
}));

jest.mock('../../src/services/or.service', () => ({
  issueOR: jest.fn(),
}));

jest.mock('../../src/services/payment.service', () => ({
  processRefund: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { refundBookingEscrow } from '../../src/services/booking-admin.service';
import * as escrowService from '../../src/services/escrow.service';
import * as paymentService from '../../src/services/payment.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const VALID_REASON = 'super-admin partial refund after dispute resolution';

beforeEach(() => {
  resetDbMock();
  (escrowService.refundFromEscrowInTransaction as jest.Mock).mockReset();
  (paymentService.processRefund as jest.Mock).mockReset();
});

describe('Bug 71 — refundBookingEscrow transactional', () => {
  it('opens exactly one transaction containing escrow helper + admin_actions', async () => {
    (escrowService.refundFromEscrowInTransaction as jest.Mock).mockResolvedValue(undefined);
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-ref' }], rowCount: 1 },
    ]));

    const result = await refundBookingEscrow(BOOKING_ID, 5000, VALID_REASON, ADMIN_ID);

    expect(getTransactionInvocations()).toBe(1);
    expect(escrowService.refundFromEscrowInTransaction).toHaveBeenCalledTimes(1);
    expect(escrowService.refundFromEscrow).not.toHaveBeenCalled();

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'refund_issued'");
    expect(auditCall!.sql).toContain('full_notes');

    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();

    expect(result.adminActionId).toBe('aaaa-ref');
    expect(result.refundedAmount).toBe(5000);
  });

  it('rolls back when admin_actions INSERT throws (audit-failure on status update Bug 71 scenario)', async () => {
    (escrowService.refundFromEscrowInTransaction as jest.Mock).mockResolvedValue(undefined);
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      refundBookingEscrow(BOOKING_ID, 5000, VALID_REASON, ADMIN_ID),
    ).rejects.toThrow(/simulated audit failure/);

    // Audit attempt was inside the transaction (not the legacy top-level path).
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();

    // Gateway refund must NOT be invoked when the transaction failed.
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it('rolls back when escrow refund helper throws (no audit row written)', async () => {
    (escrowService.refundFromEscrowInTransaction as jest.Mock).mockRejectedValue(
      new Error('insufficient escrow balance'),
    );
    setTxQueryImpl(makeRouter([]));

    await expect(
      refundBookingEscrow(BOOKING_ID, 999999, VALID_REASON, ADMIN_ID),
    ).rejects.toThrow(/insufficient escrow balance/);

    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it('does not abort the request when post-commit gateway refund fails', async () => {
    (escrowService.refundFromEscrowInTransaction as jest.Mock).mockResolvedValue(undefined);
    (paymentService.processRefund as jest.Mock).mockRejectedValue(new Error('gateway timeout'));
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-ref' }], rowCount: 1 },
    ]));

    const result = await refundBookingEscrow(BOOKING_ID, 5000, VALID_REASON, ADMIN_ID);
    expect(result.adminActionId).toBe('aaaa-ref');
    // Money + audit are durable; gateway retry happens out of band.
    expect(paymentService.processRefund).toHaveBeenCalledTimes(1);
  });

  it('rejects refundAmount <= 0 with 400', async () => {
    await expect(
      refundBookingEscrow(BOOKING_ID, 0, VALID_REASON, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects non-integer refundAmount with 400', async () => {
    await expect(
      refundBookingEscrow(BOOKING_ID, 12.5, VALID_REASON, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects reason shorter than 10 chars with 400', async () => {
    await expect(
      refundBookingEscrow(BOOKING_ID, 5000, 'short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });
});
