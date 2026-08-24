const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { completePayout } from '../src/services/payout.service';

it('Bug FIN-003 — payout completion atomically guards status and reservation while writing audit and notification', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/UPDATE payouts/.test(sql)) {
        return {
          rows: [{
            id: 'payout-1', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '25000',
            method: 'gcash', destination_account: '09171234567', account_name: null,
            status: 'completed', paymongo_transfer_id: 'transfer-1', failure_reason: null,
            rejection_reason: null, notes: null, reviewed_by: 'admin-1', reviewed_at: new Date(),
            created_at: new Date(), completed_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (/SELECT user_id FROM providers/.test(sql)) return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (callback as any)({ query });
  });

  await completePayout('payout-1', 'admin-1', 'External transfer verified at 14:30.', 'transfer-1');

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(calls.find((call) => /UPDATE payouts/.test(call.sql))?.sql).toContain("status = 'approved'");
  expect(calls.find((call) => /UPDATE wallets/.test(call.sql))?.sql).toContain('pending_balance >= $1');
  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.sql).toContain("'payout_completed'");
  expect(audit?.params[3]).toBe('External transfer verified at 14:30.');
  expect(calls.some((call) => /INSERT INTO notifications/.test(call.sql))).toBe(true);

  calls.length = 0;
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/UPDATE payouts/.test(sql)) {
        return {
          rows: [{
            id: 'payout-2', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '25000',
            method: 'gcash', destination_account: '09171234567', account_name: null,
            status: 'completed', paymongo_transfer_id: 'transfer-2', failure_reason: null,
            rejection_reason: null, notes: null, reviewed_by: 'admin-1', reviewed_at: new Date(),
            created_at: new Date(), completed_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (/UPDATE wallets/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (callback as any)({ query });
  });

  await expect(
    completePayout('payout-2', 'admin-1', 'External transfer verified at 15:00.', 'transfer-2'),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(calls.some((call) => /INSERT INTO admin_actions|INSERT INTO notifications/.test(call.sql))).toBe(false);
});
