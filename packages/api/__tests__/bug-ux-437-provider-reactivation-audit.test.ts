const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: transactionMock },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { reactivateProvider } from '../src/services/admin.service';

it('Bug UX-437 — provider reactivation requires an audit reason and notifies the provider in the same transaction', async () => {
  await expect(reactivateProvider('provider-1', 'admin-1', '')).rejects.toMatchObject({ statusCode: 400 });
  expect(transactionMock).not.toHaveBeenCalled();

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/UPDATE providers/.test(sql)) {
          return { rows: [{ id: 'provider-1', user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [{ id: 'written' }], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<void>)(client);
  });

  const reason = 'Identity review completed and suspension concern resolved.';
  await reactivateProvider('provider-1', 'admin-1', reason);

  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.params[2]).toBe(reason);
  const notification = calls.find((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notification?.params[0]).toBe('user-1');
  expect(notification?.params[1]).toContain(reason);
});
