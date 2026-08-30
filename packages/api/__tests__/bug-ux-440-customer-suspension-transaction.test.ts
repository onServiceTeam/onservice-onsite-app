const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateCustomerStatus } from '../src/services/customer-admin.service';

it('Bug UX-440 — customer suspension revokes refresh sessions, records the state delta, and notifies the customer in one transaction', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/SELECT id, is_active, is_flagged_fraud/.test(sql)) {
          return {
            rows: [{ id: 'customer-1', is_active: true, is_flagged_fraud: false }],
            rowCount: 1,
          };
        }
        if (/DELETE FROM refresh_tokens/.test(sql)) return { rows: [], rowCount: 3 };
        return { rows: [], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<unknown>)(client);
  });

  const reason = 'Support case OS-521 confirms an account takeover.';
  const result = await updateCustomerStatus('customer-1', 'suspend', reason, 'admin-1');

  expect(result).toEqual({ isActive: false });
  expect(calls.some((call) => /UPDATE users SET is_active/.test(call.sql))).toBe(true);
  expect(calls.some((call) => /DELETE FROM refresh_tokens/.test(call.sql))).toBe(true);

  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.params[1]).toBe('customer_suspended');
  expect(JSON.parse(String(audit?.params[3]))).toMatchObject({
    previousIsActive: true,
    nextIsActive: false,
    revokedSessionCount: 3,
  });
  expect(audit?.params[4]).toBe(reason);

  const notification = calls.find((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notification?.params[0]).toBe('customer-1');
  expect(notification?.params[1]).toBe('customer_suspended');
  expect(notification?.params[3]).toContain('Contact support');
});
