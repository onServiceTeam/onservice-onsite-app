// A4 + A5 — refundFromEscrow performs the escrow balance check INSIDE the
// transaction under SELECT ... FOR UPDATE, so the check + debit are atomic.
//
// Pre-fix: the sufficiency check read the escrow balance OUTSIDE the
// transaction (a check-then-act race). Two concurrent refunds could both pass
// the check and over-drain the shared escrow pool — a double refund.
//
// Post-fix: the row is locked and the balance re-checked under the lock, so a
// duplicate/concurrent refund that would exceed the held balance is rejected
// with 409 and moves no money. (NOTE: we deliberately do NOT add a
// held->refunded bookings status guard here — refundFromEscrow is a shared,
// partial-capable primitive whose callers, e.g. dispute.acceptPartialOffer,
// set escrow_status to 'partially_refunded' BEFORE calling it; such a guard
// would 409 every dispute refund.)

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/services/wallet.service', () => ({
  getPlatformWallet: jest.fn(),
  lockWalletsForUpdate: jest.fn(),
}));
jest.mock('../../src/services/payment.service', () => ({ processRefund: jest.fn() }));
jest.mock('../../src/services/or.service', () => ({ issueOR: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { refundFromEscrow } from '../../src/services/escrow.service';
import * as walletService from '../../src/services/wallet.service';
import * as paymentService from '../../src/services/payment.service';
import {
  resetDbMock,
  getTxCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const ESCROW_ID = '99999999-9999-9999-9999-999999999999';
const BOOKING_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetDbMock();
  (walletService.getPlatformWallet as jest.Mock)
    .mockReset()
    .mockResolvedValue({ id: ESCROW_ID, pending_balance: '0' });
  (paymentService.processRefund as jest.Mock).mockReset().mockResolvedValue(undefined);
});

describe('A4/A5 — refundFromEscrow atomicity + double-refund rejection', () => {
  it('A4 — locks the escrow row and checks the balance INSIDE the transaction before debiting', async () => {
    setTxQueryImpl(
      makeRouter([
        { match: /SELECT id, type[\s\S]*FROM wallets/, rows: [{ id: ESCROW_ID, type: 'platform_escrow' }], rowCount: 1 },
        { match: /SELECT pending_balance FROM wallets WHERE id = \$1 FOR UPDATE/, rows: [{ pending_balance: '5000' }], rowCount: 1 },
        { match: /UPDATE wallets SET pending_balance/, rowCount: 1 },
        { match: /INSERT INTO wallet_transactions/, rowCount: 1 },
      ]),
    );

    await refundFromEscrow(BOOKING_ID, 5000, 'dispute refund');

    const txCalls = getTxCalls();
    expect(getTransactionInvocations()).toBe(1);
    const lockIdx = txCalls.findIndex((c) => /FOR UPDATE/.test(c.sql));
    const debitIdx = txCalls.findIndex((c) => /UPDATE wallets SET pending_balance/.test(c.sql));
    // ...and the debit happens AFTER the lock (check-then-act is now atomic).
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(debitIdx).toBeGreaterThan(lockIdx);
    // Gateway refund fires post-commit.
    expect(paymentService.processRefund).toHaveBeenCalledTimes(1);
  });

  it('A4 — rejects a refund exceeding the locked balance (double-refund guard) and moves no money', async () => {
    // Locked balance (read under FOR UPDATE) is less than requested — as if a
    // prior refund already drained the pool. Must 409 and debit nothing.
    setTxQueryImpl(
      makeRouter([
        { match: /SELECT id, type[\s\S]*FROM wallets/, rows: [{ id: ESCROW_ID, type: 'platform_escrow' }], rowCount: 1 },
        { match: /SELECT pending_balance FROM wallets WHERE id = \$1 FOR UPDATE/, rows: [{ pending_balance: '1000' }], rowCount: 1 },
        { match: /UPDATE wallets SET pending_balance/, rowCount: 1 },
        { match: /INSERT INTO wallet_transactions/, rowCount: 1 },
      ]),
    );

    await expect(refundFromEscrow(BOOKING_ID, 5000, 'duplicate refund')).rejects.toMatchObject({ statusCode: 409 });

    const txCalls = getTxCalls();
    expect(txCalls.some((c) => /UPDATE wallets SET pending_balance/.test(c.sql))).toBe(false);
    expect(txCalls.some((c) => /INSERT INTO wallet_transactions/.test(c.sql))).toBe(false);
    // No gateway refund when the in-transaction guard rejected.
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it('A4 — rejects a non-positive refund amount with 400 before opening a transaction', async () => {
    await expect(refundFromEscrow(BOOKING_ID, 0, 'bad')).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });
});
