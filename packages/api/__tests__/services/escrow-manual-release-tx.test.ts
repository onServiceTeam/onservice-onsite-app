// Phase 14 Dispatch 06 — Bug 70.
// manualReleaseEscrow must do escrow money work + admin_actions audit
// inside ONE db.transaction. Pre-D06 the escrow money work ran in
// escrowService.releaseEscrow's internal transaction, then the audit
// INSERT ran in a separate db.query — if the audit failed, money was
// moved with no audit trail (compliance gap).

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/services/escrow.service', () => ({
  releaseEscrowInTransaction: jest.fn(),
  releaseEscrow: jest.fn(),
  refundFromEscrowInTransaction: jest.fn(),
  refundFromEscrow: jest.fn(),
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

import { manualReleaseEscrow } from '../../src/services/booking-admin.service';
import * as escrowService from '../../src/services/escrow.service';
import * as orService from '../../src/services/or.service';
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
const VALID_REASON = 'super-admin manual escrow release after dispute resolution review';

const HAPPY_BREAKDOWN = {
  servicePrice: 100000,
  commissionRate: 0.15,
  commissionAmount: 15000,
  serviceFeeRate: 0.10,
  serviceFeeAmount: 10000,
  guaranteeFundContribution: 150,
  providerReceives: 85000,
  platformRetains: 24850,
};

beforeEach(() => {
  resetDbMock();
  (escrowService.releaseEscrowInTransaction as jest.Mock).mockReset();
  (orService.issueOR as jest.Mock).mockReset();
});

describe('Bug 70 — manualReleaseEscrow transactional', () => {
  it('opens exactly one transaction containing escrow helper + admin_actions', async () => {
    (escrowService.releaseEscrowInTransaction as jest.Mock).mockResolvedValue(HAPPY_BREAKDOWN);
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-rel' }], rowCount: 1 },
    ]));

    await manualReleaseEscrow(BOOKING_ID, VALID_REASON, ADMIN_ID);

    expect(getTransactionInvocations()).toBe(1);
    expect(escrowService.releaseEscrowInTransaction).toHaveBeenCalledTimes(1);
    // Legacy releaseEscrow MUST NOT be called — proves D06 wiring.
    expect(escrowService.releaseEscrow).not.toHaveBeenCalled();

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'manual_escrow_release'");
    expect(auditCall!.sql).toContain('full_notes');

    // No top-level mutating writes — every mutation is inside the transaction.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });

  it('passes the same client to escrowService.releaseEscrowInTransaction', async () => {
    let receivedClient: unknown = null;
    (escrowService.releaseEscrowInTransaction as jest.Mock).mockImplementation(async (client: unknown) => {
      receivedClient = client;
      return HAPPY_BREAKDOWN;
    });
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-rel' }], rowCount: 1 },
    ]));

    await manualReleaseEscrow(BOOKING_ID, VALID_REASON, ADMIN_ID);

    expect(receivedClient).not.toBeNull();
    expect(typeof (receivedClient as { query?: unknown })?.query).toBe('function');
  });

  it('rolls back when admin_actions INSERT throws (audit-failure scenario)', async () => {
    (escrowService.releaseEscrowInTransaction as jest.Mock).mockResolvedValue(HAPPY_BREAKDOWN);
    const auditErr = new Error('simulated audit failure (CHECK constraint violated)');
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      manualReleaseEscrow(BOOKING_ID, VALID_REASON, ADMIN_ID),
    ).rejects.toThrow(/simulated audit failure/);

    // The audit attempt was inside the transaction (not the legacy
    // top-level db.query). When this throws, the runtime ROLLBACK
    // rewinds the escrow money work too.
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();

    // OR issuance is post-commit; the failed transaction must NOT trigger it.
    expect(orService.issueOR).not.toHaveBeenCalled();
  });

  it('does not abort the request when post-commit OR issuance fails', async () => {
    (escrowService.releaseEscrowInTransaction as jest.Mock).mockResolvedValue(HAPPY_BREAKDOWN);
    (orService.issueOR as jest.Mock).mockRejectedValue(new Error('OR API timeout'));
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-rel' }], rowCount: 1 },
    ]));

    // Even though OR issuance fails, the function returns successfully —
    // the money + audit are durable and the OR job retries separately.
    const result = await manualReleaseEscrow(BOOKING_ID, VALID_REASON, ADMIN_ID);
    expect(result.adminActionId).toBe('aaaa-rel');
    expect(orService.issueOR).toHaveBeenCalledTimes(1);
  });

  it('rejects empty reason with 400', async () => {
    await expect(
      manualReleaseEscrow(BOOKING_ID, '   ', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects reason shorter than 10 chars with 400', async () => {
    await expect(
      manualReleaseEscrow(BOOKING_ID, 'short', ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('stores the full reason in admin_actions.full_notes (Bug 85 column)', async () => {
    (escrowService.releaseEscrowInTransaction as jest.Mock).mockResolvedValue(HAPPY_BREAKDOWN);
    const longReason = 'x'.repeat(750);
    setTxQueryImpl(makeRouter([
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-rel' }], rowCount: 1 },
    ]));

    await manualReleaseEscrow(BOOKING_ID, longReason, ADMIN_ID);

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    // params: [adminUserId, bookingId, JSON, reason(slice 500), full_notes]
    expect(auditCall!.params[3]).toBe('x'.repeat(500));
    expect(auditCall!.params[4]).toBe(longReason);
  });
});
