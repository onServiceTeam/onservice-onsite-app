const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: queryMock,
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { revokeProviderSessions } from '../src/services/provider-admin.service';

it('Bug UX-755 — Provider 360 force sign-out revokes the owner account without changing provider, job, payment, or dispute state', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/UPDATE users/.test(sql)) {
      return { rows: [{ id: 'provider-user-1', session_version: '9' }], rowCount: 1 };
    }
    if (/DELETE FROM refresh_tokens/.test(sql)) return { rows: [], rowCount: 4 };
    return { rows: [], rowCount: 1 };
  });

  const result = await revokeProviderSessions(
    'provider-1',
    'Provider reported that the company tablet was stolen.',
    'admin-1',
  );

  expect(result).toEqual({ revokedRefreshSessions: 4, sessionVersion: 9 });
  expect(calls.some((call) => /UPDATE providers|UPDATE bookings|UPDATE disputes|UPDATE wallets/.test(call.sql))).toBe(false);
  const audit = calls.find((call) => /user_force_logout/.test(call.sql));
  expect(JSON.parse(String(audit?.params[2]))).toMatchObject({
    providerId: 'provider-1',
    revokedRefreshSessions: 4,
  });
});
