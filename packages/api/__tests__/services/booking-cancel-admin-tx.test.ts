// Phase 14 Dispatch 06 — Bug 69.
// cancelBookingAsAdmin must do escrow handling + booking status update +
// admin_actions audit inside ONE db.transaction. Pre-D06 the escrow
// handling ran in its own transaction(s) BEFORE the booking update +
// audit; if the audit insert failed after escrow money had moved, the
// money/audit pair was inconsistent.
//
// S1-8 (FIN-012, OPS-558): the booking is now locked first, inside that same
// transaction, and the state and escrow are decided from the locked row; the
// unlocked top-level pre-read is gone. These tests follow that order.
//
// This test file uses the shared D06 trx mock helper. The escrow service
// is mocked so we can simulate ROLLBACK by making the audit insert throw
// inside the captured transaction.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/services/escrow.service', () => ({
  handleCancellationInTransaction: jest.fn(),
  handleCancellation: jest.fn(),
  processCancellationGatewayRefund: jest.fn(),
  releaseEscrowInTransaction: jest.fn(),
  releaseEscrow: jest.fn(),
  refundFromEscrowInTransaction: jest.fn(),
  refundFromEscrow: jest.fn(),
  releasePartialEscrowInTransaction: jest.fn(),
  releasePartialEscrow: jest.fn(),
  holdInEscrow: jest.fn(),
}));

// The post-commit slot-waitlist kick is covered by its own tests; here it
// must not reach the mocked database.
jest.mock('../../src/services/slot-waitlist.service', () => ({
  processSlotAvailability: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cancelBookingAsAdmin } from '../../src/services/booking-admin.service';
import * as escrowService from '../../src/services/escrow.service';
import * as socketService from '../../src/services/socket.service';
import { logger } from '../../src/utils/logger';
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
const VALID_REASON = 'customer requested admin cancel due to provider no-response, ≥10 chars';

function lockedRow(status: string, escrowStatus: string | null) {
  return {
    id: BOOKING_ID, status, escrow_status: escrowStatus, provider_id: null, service_fee: 0,
    scheduled_at: new Date('2026-10-20T02:00:00.000Z'), category_id: 'category-1', city: 'Cebu City',
  };
}

// The transaction's statements, in order: lock, (money), status UPDATE,
// offers UPDATE, audit INSERT.
function txRoutes(status: string, escrowStatus: string | null, audit: { id?: string; throwError?: Error } = { id: 'aaaa-aaaa' }) {
  return makeRouter([
    { match: /SELECT \* FROM bookings WHERE id = \$1 FOR UPDATE/, rows: [lockedRow(status, escrowStatus)], rowCount: 1 },
    { match: /UPDATE bookings SET/, rows: [lockedRow('cancelled_by_admin', escrowStatus)], rowCount: 1 },
    { match: /UPDATE booking_offers/, rowCount: 0 },
    audit.throwError
      ? { match: /INSERT INTO admin_actions/, throwError: audit.throwError }
      : { match: /INSERT INTO admin_actions/, rows: [{ id: audit.id }], rowCount: 1 },
  ]);
}

beforeEach(() => {
  resetDbMock();
  (escrowService.handleCancellationInTransaction as jest.Mock).mockReset();
  (escrowService.handleCancellation as jest.Mock).mockReset();
  (escrowService.processCancellationGatewayRefund as jest.Mock).mockReset();
});

describe('Bug 69 — cancelBookingAsAdmin transactional', () => {
  it('opens exactly one transaction containing all writes', async () => {
    setTxQueryImpl(txRoutes('requested', null));

    await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false);

    expect(getTransactionInvocations()).toBe(1);
    // S1-8: the booking is read and locked inside the transaction, first.
    const txCalls = getTxCalls();
    expect(txCalls[0]?.sql).toMatch(/SELECT \* FROM bookings WHERE id = \$1 FOR UPDATE/);
    // Every mutating write is inside the transaction.
    expect(txCalls.find((c) => /UPDATE bookings SET/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();
    // No top-level booking read or mutating query — proves no leak outside
    // the transaction and no unlocked pre-read.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /FROM bookings|UPDATE bookings|INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });

  it('passes the same client to escrowService.handleCancellationInTransaction when escrow held', async () => {
    let receivedClient: unknown = null;
    (escrowService.handleCancellationInTransaction as jest.Mock).mockImplementation(async (client: unknown) => {
      receivedClient = client;
      return { customerRefundAmount: 50000, providerCompensationAmount: 0, customerRefundPercent: 1.0 };
    });
    setTxQueryImpl(txRoutes('paid', 'held'));

    const result = await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false);

    expect(escrowService.handleCancellationInTransaction).toHaveBeenCalledTimes(1);
    expect(receivedClient).not.toBeNull();
    expect(typeof (receivedClient as { query?: unknown })?.query).toBe('function');
    expect(result.refundAmount).toBe(50000);
    expect(result.adminActionId).toBe('aaaa-aaaa');
    // The payment-record step runs after the commit, with the admin labels.
    expect(escrowService.processCancellationGatewayRefund).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({ customerRefundAmount: 50000 }),
      0,
      false,
      { refundReason: `Admin cancellation: ${VALID_REASON.slice(0, 100)}`, retryDescription: 'Admin cancellation refund' },
    );
  });

  it('rolls back when admin_actions INSERT throws (the audit-failure scenario)', async () => {
    (escrowService.handleCancellationInTransaction as jest.Mock).mockResolvedValue({
      customerRefundAmount: 50000, providerCompensationAmount: 0, customerRefundPercent: 1.0,
    });
    const auditErr = new Error('simulated audit failure (CHECK constraint violated)');
    setTxQueryImpl(txRoutes('paid', 'held', { throwError: auditErr }));

    await expect(
      cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false),
    ).rejects.toThrow(/simulated audit failure/);

    // The audit insert is inside the SAME transaction as the escrow-helper
    // writes, so when it throws the runtime ROLLBACK undoes the escrow
    // movement too. We verify the audit attempt happened inside the
    // transaction (not the top-level db.query path), and that the gateway
    // step never ran for the rolled-back cancellation.
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
    expect(escrowService.processCancellationGatewayRefund).not.toHaveBeenCalled();
  });

  it('rolls back when escrow handler throws (no audit row written)', async () => {
    (escrowService.handleCancellationInTransaction as jest.Mock).mockRejectedValue(
      new Error('simulated escrow failure (insufficient pending balance)'),
    );
    setTxQueryImpl(txRoutes('paid', 'held'));

    await expect(
      cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false),
    ).rejects.toThrow(/simulated escrow failure/);

    // Audit was never attempted — abort happened before the status update or
    // insert. (Any UPDATE of the booking row counts: the status is a parameter.)
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
    expect(txCalls.find((c) => /UPDATE bookings SET/.test(c.sql))).toBeUndefined();
  });

  it('a failure after the commit is logged and the committed cancellation still returns its result (C-19)', async () => {
    (escrowService.handleCancellationInTransaction as jest.Mock).mockResolvedValue({
      customerRefundAmount: 50000, providerCompensationAmount: 0, customerRefundPercent: 1.0,
    });
    (escrowService.processCancellationGatewayRefund as jest.Mock).mockRejectedValueOnce(new Error('synthetic gateway step failure'));
    const emit = jest.spyOn(socketService, 'emitAdminEvent').mockImplementation(() => { throw new Error('synthetic socket failure'); });
    setTxQueryImpl(txRoutes('paid', 'held'));
    try {
      const result = await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false);
      expect(result).toEqual({ bookingId: BOOKING_ID, refundAmount: 50000, adminActionId: 'aaaa-aaaa', customerRefundAmount: 50000 });
      expect(logger.error).toHaveBeenCalledWith(
        'Admin cancellation payment refund step failed after commit; reconcile the payment refund manually',
        expect.objectContaining({ bookingId: BOOKING_ID, customerRefundAmount: 50000 }),
      );
      expect(logger.warn).toHaveBeenCalledWith('Admin socket emit failed', expect.objectContaining({ event: 'booking:status_changed' }));
    } finally {
      emit.mockRestore();
    }
  });

  it('rejects reasons shorter than 10 characters', async () => {
    await expect(
      cancelBookingAsAdmin(BOOKING_ID, 'short', ADMIN_ID),
    ).rejects.toThrow(/at least 10 characters/);
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects already-cancelled booking with 409', async () => {
    setTxQueryImpl(txRoutes('cancelled_by_customer', null));

    await expect(
      cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID),
    ).rejects.toThrow(/Cannot cancel booking/);
    // S1-8: decided on the locked row, so the transaction opens; nothing is
    // written and no money moves.
    const txCalls = getTxCalls();
    expect(txCalls).toHaveLength(1);
    expect(txCalls[0]?.sql).toMatch(/FOR UPDATE/);
    expect(escrowService.handleCancellationInTransaction).not.toHaveBeenCalled();
  });

  it('skips escrow handler when escrow_status is not held', async () => {
    setTxQueryImpl(txRoutes('requested', null));

    const result = await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID);

    expect(escrowService.handleCancellationInTransaction).not.toHaveBeenCalled();
    expect(escrowService.processCancellationGatewayRefund).not.toHaveBeenCalled();
    expect(result.refundAmount).toBe(0);
  });

  it('stores the full reason in admin_actions.full_notes (Bug 85 column)', async () => {
    const longReason = 'a'.repeat(800); // >500 chars to verify reason vs full_notes split
    setTxQueryImpl(txRoutes('requested', null));

    await cancelBookingAsAdmin(BOOKING_ID, longReason, ADMIN_ID);

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain('full_notes');
    // params: [adminUserId, bookingId, JSON, reason(slice 500), full_notes]
    expect(auditCall!.params[3]).toBe('a'.repeat(500));
    expect(auditCall!.params[4]).toBe(longReason);
  });
});
