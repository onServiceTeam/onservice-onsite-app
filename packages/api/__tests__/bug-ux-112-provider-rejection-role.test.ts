const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { rejectProvider } from '../src/services/admin.service';

it('BUG-UX-112 — rejection repairs legacy applicants that were promoted before approval', async () => {
  const transactionCalls: Array<{ sql: string; params: unknown[] }> = [];
  dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        transactionCalls.push({ sql, params });
        if (/UPDATE providers/i.test(sql)) {
          return { rows: [{ id: 'provider-1', user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return (cb as (client: typeof client) => Promise<unknown>)(client);
  });

  await rejectProvider('provider-1', 'admin-1', 'Identity details did not match');

  const repair = transactionCalls.find((call) => /UPDATE users SET role = 'customer'/i.test(call.sql));
  expect(repair).toBeDefined();
  expect(repair!.sql).toMatch(/role = 'provider'/i);
  expect(repair!.params).toEqual(['user-1']);
});
