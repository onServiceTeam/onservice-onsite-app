jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
const lockWalletsMock = jest.fn();
jest.mock('../src/services/wallet.service', () => ({
  getUserWalletInTransaction: jest.fn(),
  lockWalletsForUpdate: (...args: unknown[]) => lockWalletsMock(...args),
}));
jest.mock('../src/services/payment.service', () => ({ processRefund: jest.fn() }));
jest.mock('../src/services/or.service', () => ({ issueOR: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { refundFromEscrowInTransaction } from '../src/services/escrow.service';

it('Bug OPS-283 — a refund cannot consume escrow belonging to another booking', async () => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT customer_id, payment_method')) {
      return { rows: [{ customer_id: 'customer-283', payment_method: 'gcash' }], rowCount: 1 };
    }
    if (sql.includes('type = ANY')) {
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111', type: 'platform_escrow' }], rowCount: 1 };
    }
    if (sql.includes('SELECT pending_balance')) {
      return { rows: [{ pending_balance: '1000000' }], rowCount: 1 };
    }
    if (sql.includes('COALESCE(SUM(amount), 0)')) {
      return { rows: [{ remaining: '1000' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });

  await expect(refundFromEscrowInTransaction(
    { query } as never,
    '22222222-2222-4222-8222-222222222222',
    1500,
    'Operator-approved partial refund',
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(query.mock.calls.some(([sql]) => String(sql).includes('pending_balance = pending_balance -')))
    .toBe(false);
});
