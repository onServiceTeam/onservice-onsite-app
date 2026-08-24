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

import { rejectPayout } from '../src/services/payout.service';

it('Bug FIN-004 — payout rejection atomically returns the reservation and records the reason for admin and provider', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/UPDATE payouts/.test(sql)) {
        return {
          rows: [{
            id: 'payout-1', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '25000',
            method: 'gcash', destination_account: '09171234567', account_name: null,
            status: 'rejected', paymongo_transfer_id: null, failure_reason: null,
            rejection_reason: 'Destination account does not match.', notes: null,
            reviewed_by: 'admin-1', reviewed_at: new Date(), created_at: new Date(), completed_at: null,
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

  await rejectPayout('payout-1', 'admin-1', 'Destination account does not match.');

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(calls.find((call) => /UPDATE payouts/.test(call.sql))?.sql).toContain("'aml_review_pending', 'pending'");
  const wallet = calls.find((call) => /UPDATE wallets/.test(call.sql));
  expect(wallet?.sql).toContain('pending_balance >= $1');
  expect(wallet?.sql).toContain('available_balance = available_balance + $1');
  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.params[3]).toBe('Destination account does not match.');
  const notification = calls.find((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notification?.params[1]).toContain('Destination account does not match.');

  calls.length = 0;
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/UPDATE payouts/.test(sql)) {
        return {
          rows: [{
            id: 'payout-2', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '25000',
            method: 'gcash', destination_account: '09171234567', account_name: null,
            status: 'rejected', paymongo_transfer_id: null, failure_reason: null,
            rejection_reason: 'Reservation mismatch.', notes: null,
            reviewed_by: 'admin-1', reviewed_at: new Date(), created_at: new Date(), completed_at: null,
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
    rejectPayout('payout-2', 'admin-1', 'Reservation mismatch requires investigation.'),
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(calls.some((call) => /INSERT INTO wallet_transactions|INSERT INTO admin_actions|INSERT INTO notifications/.test(call.sql))).toBe(false);
});
