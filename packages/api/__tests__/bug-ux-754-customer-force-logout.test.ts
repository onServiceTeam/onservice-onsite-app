const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: queryMock,
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));
jest.mock('../src/services/settings.service', () => ({}));

import { revokeCustomerSessions } from '../src/services/customer-admin.service';

it('Bug UX-754 — Customer 360 force sign-out invalidates access generations, removes refresh sessions, and records the reason', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/UPDATE users/.test(sql)) return { rows: [{ session_version: '7' }], rowCount: 1 };
    if (/DELETE FROM refresh_tokens/.test(sql)) return { rows: [], rowCount: 2 };
    return { rows: [], rowCount: 1 };
  });

  const result = await revokeCustomerSessions(
    'customer-1',
    'Customer requested sign-out from every lost device.',
    'admin-1',
  );

  expect(result).toEqual({ revokedRefreshSessions: 2, sessionVersion: 7 });
  expect(calls.find((call) => /UPDATE users/.test(call.sql))?.sql).toMatch(/session_version = session_version \+ 1/);
  const audit = calls.find((call) => /user_force_logout/.test(call.sql));
  expect(audit?.params[3]).toBe('Customer requested sign-out from every lost device.');
});
