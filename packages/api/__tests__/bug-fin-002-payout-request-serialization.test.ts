const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn(async () => 50_000_000),
}));
jest.mock('../src/services/wallet.service', () => ({
  getUserWallet: jest.fn(async () => ({ id: 'wallet-1', available_balance: '90000000' })),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { requestPayout } from '../src/services/payout.service';

it('Bug FIN-002 — payout request serializes the one-in-flight check and treats an AML hold as in flight', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'provider-1' }], rowCount: 1 });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: '1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (callback as any)({ query });
  });

  await expect(requestPayout('provider-user-1', {
    amount: 10_000,
    method: 'gcash',
    destinationAccount: '09171234567',
  })).rejects.toMatchObject({ statusCode: 409 });

  expect(calls[0]?.sql).toContain('pg_advisory_xact_lock');
  expect(calls[1]?.sql).toContain("'aml_review_pending'");
  expect(calls.some((call) => /UPDATE wallets/.test(call.sql))).toBe(false);
  expect(calls.some((call) => /INSERT INTO payouts/.test(call.sql))).toBe(false);
});
