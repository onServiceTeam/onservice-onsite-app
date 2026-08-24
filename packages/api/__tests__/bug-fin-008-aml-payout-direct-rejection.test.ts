const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { rejectPayout } from '../src/services/payout.service';

it('Bug FIN-008 — an AML-held payout can be rejected without first clearing its compliance hold', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/UPDATE payouts/.test(sql)) {
        expect(sql).toContain("status IN ('aml_review_pending', 'pending')");
        return {
          rows: [{
            id: 'payout-aml-1', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '50000000',
            method: 'gcash', destination_account: '09171234567', account_name: 'Maria Santos',
            status: 'rejected', paymongo_transfer_id: null, failure_reason: null,
            rejection_reason: 'Required compliance evidence was not supplied.', notes: null,
            reviewed_by: 'admin-1', reviewed_at: new Date(), created_at: new Date(), completed_at: null,
            requires_aml_review: true, aml_threshold_at_request_centavos: '50000000',
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

  await rejectPayout('payout-aml-1', 'admin-1', 'Required compliance evidence was not supplied.');

  const wallet = calls.find((call) => /UPDATE wallets/.test(call.sql));
  expect(wallet?.params[0]).toBe(50_000_000);
  expect(wallet?.sql).toContain('pending_balance >= $1');
  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.params[3]).toBe('Required compliance evidence was not supplied.');
  const notification = calls.find((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notification?.params[1]).toContain('reserved amount was returned');
});
