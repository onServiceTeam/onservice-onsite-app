const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: queryMock,
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { suspendProvider } from '../src/services/admin.service';
import { mockDecisionLocks } from './helpers/provider-decision-mock';

it('Bug UX-745 — provider suspension revokes every credential in the same transaction as provider and in-flight-job holds', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const lock = mockDecisionLocks(sql, 'provider-user-1');
    if (lock) return lock;
    if (/UPDATE providers/.test(sql)) {
      return { rows: [{ id: 'provider-1', user_id: 'provider-user-1' }], rowCount: 1 };
    }
    if (/UPDATE bookings/.test(sql)) return { rows: [{ id: 'booking-1' }], rowCount: 1 };
    if (/DELETE FROM refresh_tokens/.test(sql)) return { rows: [], rowCount: 3 };
    return { rows: [], rowCount: 1 };
  });

  await suspendProvider(
    'provider-1',
    'admin-1',
    'Support case OS-745 confirmed a provider account compromise.',
  );

  const accountUpdate = calls.find((call) => /UPDATE users/.test(call.sql));
  expect(accountUpdate?.sql).toMatch(/session_version = session_version \+ 1/);
  expect(accountUpdate?.params).toEqual(['provider-user-1']);
  expect(calls.some((call) => /DELETE FROM refresh_tokens/.test(call.sql))).toBe(true);
  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(JSON.parse(String(audit?.params[2]))).toMatchObject({
    inFlightBookingsFlagged: 1,
    revokedRefreshSessions: 3,
    allAccessCredentialsInvalidated: true,
  });
});
