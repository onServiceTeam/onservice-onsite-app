// Phase 14 Dispatch 06 — Bug 69.
// cancelBookingAsAdmin must do escrow handling + booking status update +
// admin_actions audit inside ONE db.transaction. Pre-D06 the escrow
// handling ran in its own transaction(s) BEFORE the booking update +
// audit; if the audit insert failed after escrow money had moved, the
// money/audit pair was inconsistent.
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
  releaseEscrowInTransaction: jest.fn(),
  releaseEscrow: jest.fn(),
  refundFromEscrowInTransaction: jest.fn(),
  refundFromEscrow: jest.fn(),
  releasePartialEscrowInTransaction: jest.fn(),
  releasePartialEscrow: jest.fn(),
  holdInEscrow: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cancelBookingAsAdmin } from '../../src/services/booking-admin.service';
import * as escrowService from '../../src/services/escrow.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  setTopQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const VALID_REASON = 'customer requested admin cancel due to provider no-response, ≥10 chars';

beforeEach(() => {
  resetDbMock();
  (escrowService.handleCancellationInTransaction as jest.Mock).mockReset();
  (escrowService.handleCancellation as jest.Mock).mockReset();
});

describe('Bug 69 — cancelBookingAsAdmin transactional', () => {
  it('opens exactly one transaction containing all writes', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings WHERE id = \$1$/, rows: [{ id: BOOKING_ID, status: 'requested', escrow_status: null }], rowCount: 1 },
    ]));
    setTxQueryImpl(makeRouter([
      { match: /UPDATE bookings/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-aaaa' }], rowCount: 1 },
    ]));

    await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false);

    expect(getTransactionInvocations()).toBe(1);
    // The booking lookup happens via top-level db.query (read-only fast-fail).
    const topCalls = getTopCalls();
    expect(topCalls[0]?.sql).toMatch(/SELECT id, status, escrow_status FROM bookings/);
    // Every mutating write is inside the transaction.
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE bookings/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();
    // No top-level mutating queries — proves no leak outside the transaction.
    expect(topCalls.find((c) => /UPDATE bookings|INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });

  it('passes the same client to escrowService.handleCancellationInTransaction when escrow held', async () => {
    let receivedClient: unknown = null;
    (escrowService.handleCancellationInTransaction as jest.Mock).mockImplementation(async (client: unknown) => {
      receivedClient = client;
      return { customerRefundAmount: 50000, providerCompensationAmount: 0, customerRefundPercent: 1.0 };
    });

    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings/, rows: [{ id: BOOKING_ID, status: 'paid', escrow_status: 'held' }], rowCount: 1 },
    ]));
    setTxQueryImpl(makeRouter([
      { match: /UPDATE bookings/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-aaaa' }], rowCount: 1 },
    ]));

    const result = await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false);

    expect(escrowService.handleCancellationInTransaction).toHaveBeenCalledTimes(1);
    expect(receivedClient).not.toBeNull();
    expect(typeof (receivedClient as { query?: unknown })?.query).toBe('function');
    expect(result.refundAmount).toBe(50000);
    expect(result.adminActionId).toBe('aaaa-aaaa');
  });

  it('rolls back when admin_actions INSERT throws (the audit-failure scenario)', async () => {
    (escrowService.handleCancellationInTransaction as jest.Mock).mockResolvedValue({
      customerRefundAmount: 50000, providerCompensationAmount: 0, customerRefundPercent: 1.0,
    });

    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings/, rows: [{ id: BOOKING_ID, status: 'paid', escrow_status: 'held' }], rowCount: 1 },
    ]));

    const auditErr = new Error('simulated audit failure (CHECK constraint violated)');
    setTxQueryImpl(makeRouter([
      { match: /UPDATE bookings/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false),
    ).rejects.toThrow(/simulated audit failure/);

    // Pre-D06: handleCancellation moved escrow money in its own transaction
    // BEFORE the audit insert ran, so the audit failure left committed money.
    // Post-D06: the audit insert is inside the SAME transaction as the
    // escrow-helper writes, so when it throws here the runtime ROLLBACK
    // would undo the escrow movement too. We verify the audit attempt
    // happened inside the transaction (not the top-level db.query path).
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });

  it('rolls back when escrow handler throws (no audit row written)', async () => {
    (escrowService.handleCancellationInTransaction as jest.Mock).mockRejectedValue(
      new Error('simulated escrow failure (insufficient pending balance)'),
    );

    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings/, rows: [{ id: BOOKING_ID, status: 'paid', escrow_status: 'held' }], rowCount: 1 },
    ]));
    setTxQueryImpl(makeRouter([]));

    await expect(
      cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID, 24, false, false),
    ).rejects.toThrow(/simulated escrow failure/);

    // Audit was never attempted — abort happened before status update or insert.
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
    expect(txCalls.find((c) => /UPDATE bookings\s+SET status = 'cancelled_by_admin'/.test(c.sql))).toBeUndefined();
  });

  it('rejects reasons shorter than 10 characters', async () => {
    await expect(
      cancelBookingAsAdmin(BOOKING_ID, 'short', ADMIN_ID),
    ).rejects.toThrow(/at least 10 characters/);
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects already-cancelled booking with 409', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings/, rows: [{ id: BOOKING_ID, status: 'cancelled_by_customer', escrow_status: null }], rowCount: 1 },
    ]));

    await expect(
      cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID),
    ).rejects.toThrow(/Cannot cancel booking/);
    expect(getTransactionInvocations()).toBe(0);
  });

  it('skips escrow handler when escrow_status is not held', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings/, rows: [{ id: BOOKING_ID, status: 'requested', escrow_status: null }], rowCount: 1 },
    ]));
    setTxQueryImpl(makeRouter([
      { match: /UPDATE bookings/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-aaaa' }], rowCount: 1 },
    ]));

    const result = await cancelBookingAsAdmin(BOOKING_ID, VALID_REASON, ADMIN_ID);

    expect(escrowService.handleCancellationInTransaction).not.toHaveBeenCalled();
    expect(result.refundAmount).toBe(0);
  });

  it('stores the full reason in admin_actions.full_notes (Bug 85 column)', async () => {
    const longReason = 'a'.repeat(800); // >500 chars to verify reason vs full_notes split

    setTopQueryImpl(makeRouter([
      { match: /SELECT id, status, escrow_status FROM bookings/, rows: [{ id: BOOKING_ID, status: 'requested', escrow_status: null }], rowCount: 1 },
    ]));
    setTxQueryImpl(makeRouter([
      { match: /UPDATE bookings/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'aaaa-aaaa' }], rowCount: 1 },
    ]));

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
