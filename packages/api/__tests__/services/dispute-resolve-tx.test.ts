// Phase 14 Dispatch 06 — Bug 83.
// adminResolveDispute must do the dispute UPDATE + booking UPDATE +
// notifications + admin_actions audit inside ONE db.transaction. Pre-D06
// it called disputeService.resolveDispute (transactional internally) THEN
// inserted admin_actions in a SEPARATE top-level db.query. If the audit
// failed after dispute state was already committed, the dispute changed
// status without the admin-level audit trail.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/services/dispute.service', () => ({
  resolveDisputeInTransaction: jest.fn(),
  resolveDispute: jest.fn(),
  assertDisputeResolutionAvailable: jest.fn(),
  assignDispute: jest.fn(),
  escalateDispute: jest.fn(),
}));

jest.mock('../../src/services/escrow.service', () => ({
  refundFromEscrow: jest.fn(),
  releasePartialEscrow: jest.fn(),
  releaseEscrow: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { adminResolveDispute } from '../../src/services/dispute-admin.service';
import * as disputeService from '../../src/services/dispute.service';
import * as escrowService from '../../src/services/escrow.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const DISPUTE_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const BOOKING_ID = '33333333-3333-3333-3333-333333333333';
const PROVIDER_ID = '44444444-4444-4444-4444-444444444444';

const HAPPY_HELPER = {
  dispute: {} as unknown,
  refundAmount: 50000,
  refundPercent: 100,
  bookingId: BOOKING_ID,
  bookingTotalAmount: 50000,
  providerId: PROVIDER_ID,
  pushRequests: [],
};

beforeEach(() => {
  resetDbMock();
  (disputeService.resolveDisputeInTransaction as jest.Mock).mockReset();
  (escrowService.refundFromEscrow as jest.Mock).mockReset();
  (escrowService.releasePartialEscrow as jest.Mock).mockReset();
  (escrowService.releaseEscrow as jest.Mock).mockReset();
});

describe('Bug 83 — adminResolveDispute transactional', () => {
  it('opens one transaction containing helper + admin_actions audit', async () => {
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockResolvedValue(HAPPY_HELPER);
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-res' }], rowCount: 1 },
    ]));

    const result = await adminResolveDispute(
      DISPUTE_ID,
      { resolutionType: 'full_refund', decisionNotes: 'Provider failed to deliver service' },
      ADMIN_ID,
    );

    expect(getTransactionInvocations()).toBe(1);
    expect(disputeService.resolveDisputeInTransaction).toHaveBeenCalledTimes(1);
    // Legacy resolveDispute MUST NOT be called.
    expect(disputeService.resolveDispute).not.toHaveBeenCalled();

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'dispute_resolved'");
    expect(auditCall!.sql).toContain('full_notes');

    // No top-level audit insert leaked.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();

    expect(result.adminActionId).toBe('audit-res');
    expect(result.refundAmount).toBe(50000);
  });

  it('passes the same client to resolveDisputeInTransaction', async () => {
    let receivedClient: unknown = null;
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockImplementation(async (client: unknown) => {
      receivedClient = client;
      return HAPPY_HELPER;
    });
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-res' }], rowCount: 1 },
    ]));

    await adminResolveDispute(
      DISPUTE_ID,
      { resolutionType: 'full_refund', decisionNotes: 'Sufficiently long decision notes' },
      ADMIN_ID,
    );

    expect(typeof (receivedClient as { query?: unknown })?.query).toBe('function');
  });

  it('rolls back when admin_actions INSERT throws (audit-failure scenario)', async () => {
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockResolvedValue(HAPPY_HELPER);
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      adminResolveDispute(
        DISPUTE_ID,
        { resolutionType: 'full_refund', decisionNotes: 'Sufficiently long decision notes' },
        ADMIN_ID,
      ),
    ).rejects.toThrow(/simulated audit failure/);

    // Post-commit escrow refund/release MUST NOT run when transaction failed.
    expect(escrowService.refundFromEscrow).not.toHaveBeenCalled();
    expect(escrowService.releaseEscrow).not.toHaveBeenCalled();
  });

  it('rolls back when helper throws (no audit row)', async () => {
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockRejectedValue(
      new Error('simulated dispute helper failure'),
    );
    setTxQueryImpl(makeRouter([]));

    await expect(
      adminResolveDispute(
        DISPUTE_ID,
        { resolutionType: 'full_refund', decisionNotes: 'Sufficiently long decision notes' },
        ADMIN_ID,
      ),
    ).rejects.toThrow(/simulated dispute helper failure/);

    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
    expect(escrowService.refundFromEscrow).not.toHaveBeenCalled();
  });

  it('runs post-commit escrow refund + releasePartialEscrow on partial_refund', async () => {
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockResolvedValue({
      ...HAPPY_HELPER,
      refundAmount: 30000,
      refundPercent: 60,
      bookingTotalAmount: 50000,
    });
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-res' }], rowCount: 1 },
    ]));

    await adminResolveDispute(
      DISPUTE_ID,
      { resolutionType: 'partial_refund', refundPercent: 60, decisionNotes: 'Sufficiently long decision notes' },
      ADMIN_ID,
    );

    expect(escrowService.refundFromEscrow).toHaveBeenCalledWith(BOOKING_ID, 30000, expect.stringContaining('partial_refund'));
    expect(escrowService.releasePartialEscrow).toHaveBeenCalledWith(BOOKING_ID, 20000);
  });

  it('runs post-commit releaseEscrow on no_refund', async () => {
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockResolvedValue({
      ...HAPPY_HELPER,
      refundAmount: 0,
      refundPercent: 0,
    });
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-res' }], rowCount: 1 },
    ]));

    await adminResolveDispute(
      DISPUTE_ID,
      { resolutionType: 'no_refund', decisionNotes: 'Provider performed adequately' },
      ADMIN_ID,
    );

    expect(escrowService.releaseEscrow).toHaveBeenCalledWith(BOOKING_ID);
    expect(escrowService.refundFromEscrow).not.toHaveBeenCalled();
  });

  it('does not crash when post-commit gateway refund fails', async () => {
    (disputeService.resolveDisputeInTransaction as jest.Mock).mockResolvedValue(HAPPY_HELPER);
    (escrowService.refundFromEscrow as jest.Mock).mockRejectedValue(new Error('gateway timeout'));
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-res' }], rowCount: 1 },
    ]));

    const result = await adminResolveDispute(
      DISPUTE_ID,
      { resolutionType: 'full_refund', decisionNotes: 'Sufficiently long decision notes' },
      ADMIN_ID,
    );

    // Function returned successfully — money + audit are durable; gateway retries out of band.
    expect(result.adminActionId).toBe('audit-res');
  });

  it('rejects decisionNotes < 20 chars', async () => {
    await expect(
      adminResolveDispute(
        DISPUTE_ID,
        { resolutionType: 'full_refund', decisionNotes: 'too short' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects partial_refund without refundPercent', async () => {
    await expect(
      adminResolveDispute(
        DISPUTE_ID,
        { resolutionType: 'partial_refund', decisionNotes: 'Sufficiently long decision notes' },
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });
});
