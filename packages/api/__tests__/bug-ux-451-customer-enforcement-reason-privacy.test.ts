const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateCustomerStatus } from '../src/services/customer-admin.service';

it('Bug UX-451 — internal customer-enforcement evidence is audited but not exposed in the customer notification', async () => {
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
        return { rows: [], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<unknown>)(client);
  });
  const internalReason = 'Device fingerprint linked to confidential case OS-529.';

  await updateCustomerStatus('customer-1', 'suspend', internalReason, 'admin-1');

  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.params[4]).toBe(internalReason);
  const notification = calls.find((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notification?.params[3]).not.toContain(internalReason);
  expect(String(notification?.params[4])).not.toContain(internalReason);
  expect(JSON.parse(String(notification?.params[4]))).toEqual({ accountStatus: 'suspended' });
});
