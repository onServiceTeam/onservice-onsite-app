const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { suspendProvider } from '../src/services/admin.service';

it('Bug UX-438 — provider suspension sends the reason to the affected provider in the status transaction', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/UPDATE providers/.test(sql)) {
          return { rows: [{ id: 'provider-1', user_id: 'user-1' }], rowCount: 1 };
        }
        if (/UPDATE bookings/.test(sql)) return { rows: [], rowCount: 0 };
        return { rows: [{ id: 'written' }], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<void>)(client);
  });

  const reason = 'Support case OS-482 documents an identity mismatch.';
  await suspendProvider('provider-1', 'admin-1', reason);

  const notification = calls.find((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notification?.params[0]).toBe('user-1');
  expect(notification?.params[1]).toContain(reason);
  expect(notification?.params[2]).toContain('provider-1');
});
