const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: queryMock,
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

jest.mock('../src/services/settings.service', () => ({}));

import { updateCustomerStatus } from '../src/services/customer-admin.service';

it('Bug UX-744 — customer suspension advances the session generation so old access cannot revive after reactivation', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT id, is_active, is_flagged_fraud/.test(sql)) {
      return { rows: [{ id: 'customer-1', is_active: true, is_flagged_fraud: false }], rowCount: 1 };
    }
    if (/DELETE FROM refresh_tokens/.test(sql)) return { rows: [], rowCount: 2 };
    return { rows: [], rowCount: 1 };
  });

  await updateCustomerStatus(
    'customer-1',
    'suspend',
    'Support case OS-744 confirmed an account takeover.',
    'admin-1',
  );

  const accountUpdate = calls.find((call) => /UPDATE users/.test(call.sql) && /is_active = FALSE/.test(call.sql));
  expect(accountUpdate?.sql).toMatch(/session_version = session_version \+ 1/);
  expect(calls.some((call) => /DELETE FROM refresh_tokens/.test(call.sql))).toBe(true);
  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(JSON.parse(String(audit?.params[3]))).toMatchObject({
    revokedSessionCount: 2,
    allAccessCredentialsInvalidated: true,
  });
});
