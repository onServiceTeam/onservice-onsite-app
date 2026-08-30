const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));

jest.mock('../src/services/notification.service', () => ({
  createPushNotification: jest.fn(),
}));

import { setStaffSuspension } from '../src/services/provider-staff.service';

it('Bug UX-432 — provider-staff suspension requires and preserves an audit reason with the status change', async () => {
  await expect(
    setStaffSuspension({
      staffId: 'staff-1',
      adminId: 'admin-1',
      suspend: true,
    }),
  ).rejects.toMatchObject({
    statusCode: 400,
    message: 'reason must be at least 10 characters.',
  });
  expect(transactionMock).not.toHaveBeenCalled();

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/SELECT \* FROM provider_staff/.test(sql)) {
          return { rows: [{ id: 'staff-1', status: 'approved' }], rowCount: 1 };
        }
        if (/UPDATE provider_staff/.test(sql)) {
          return { rows: [{ id: 'staff-1', status: 'suspended' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<void>)(client);
  });

  const reason = 'Support case OS-482 documents an identity mismatch.';
  await setStaffSuspension({
    staffId: 'staff-1',
    adminId: 'admin-1',
    suspend: true,
    reason,
  });

  const audit = calls.find((call) => /INSERT INTO admin_actions/.test(call.sql));
  expect(audit?.params[4]).toBe(reason);
  expect(audit?.params[5]).toBe(reason);
});
