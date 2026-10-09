jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
const getUserWalletInTransactionMock = jest.fn();
const lockWalletsMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getUserWalletInTransaction: (...args: unknown[]) => getUserWalletInTransactionMock(...args),
  lockWalletsForUpdate: (...args: unknown[]) => lockWalletsMock(...args),
}));
jest.mock('../src/services/payment.service', () => ({ processRefund: jest.fn() }));
jest.mock('../src/services/or.service', () => ({ issueOR: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { refundFromEscrowInTransaction } from '../src/services/escrow.service';

it('Bug OPS-284 — a wallet-funded refund atomically credits the customer wallet', async () => {
  const escrowWalletId = '11111111-1111-4111-8111-111111111111';
  const customerWalletId = '22222222-2222-4222-8222-222222222222';
  const bookingId = '33333333-3333-4333-8333-333333333333';
  getUserWalletInTransactionMock.mockResolvedValue({ id: customerWalletId, type: 'customer' });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT customer_id, payment_method')) {
      return { rows: [{ customer_id: 'customer-284', payment_method: 'wallet' }], rowCount: 1 };
    }
    if (sql.includes('type = ANY')) {
      return { rows: [{ id: escrowWalletId, type: 'platform_escrow' }], rowCount: 1 };
    }
    if (sql.includes('SELECT pending_balance')) {
      return { rows: [{ pending_balance: '50000' }], rowCount: 1 };
    }
    if (sql.includes('COALESCE(SUM(amount), 0)')) {
      return { rows: [{ remaining: '50000' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });

  const result = await refundFromEscrowInTransaction(
    { query } as never, bookingId, 12500, 'Customer support adjustment',
  );

  expect(lockWalletsMock).toHaveBeenCalledWith(expect.anything(), [escrowWalletId, customerWalletId]);
  expect(calls.find(({ sql }) => sql.includes('available_balance = available_balance + $1'))?.params)
    .toEqual([12500, customerWalletId]);
  expect(calls.find(({ sql }) => sql.includes("reference_id)\n       VALUES") && sql.includes("'refund'"))?.params)
    .toEqual([customerWalletId, bookingId, 12500, 'Wallet refund: Customer support adjustment', bookingId]);
  expect(result).toEqual({
    remainingEscrowCentavos: 37500,
    paymentMethod: 'wallet',
    customerWalletCredited: true,
  });
});
