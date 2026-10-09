const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn().mockResolvedValue({ rows: [] }), transaction: transactionMock },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: jest.fn(),
}));

import { reviewStaff, setStaffSuspension } from '../src/services/provider-staff.service';

it('Bug OPS-410 - provider staff decisions preserve their owning provider in every new audit payload', async () => {
  const providerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const staffId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const auditPayloads: Array<Record<string, unknown>> = [];

  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/SELECT \* FROM provider_staff/.test(sql)) {
          return { rows: [{ id: staffId, provider_id: providerId, status: 'pending_review' }], rowCount: 1 };
        }
        if (/UPDATE provider_staff/.test(sql)) {
          const nextStatus = params[0] as string;
          return { rows: [{ id: staffId, provider_id: providerId, status: nextStatus }], rowCount: 1 };
        }
        if (/INSERT INTO admin_actions/.test(sql)) {
          const serialized = params[3];
          if (typeof serialized === 'string') auditPayloads.push(JSON.parse(serialized));
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return callback(client);
  });

  await reviewStaff({ staffId, adminId: 'admin-1', decision: 'sent_back', reason: 'Add a clearer ID photo.' });

  transactionMock.mockImplementationOnce(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/SELECT \* FROM provider_staff/.test(sql)) {
          return { rows: [{ id: staffId, provider_id: providerId, status: 'approved' }], rowCount: 1 };
        }
        if (/UPDATE provider_staff/.test(sql)) {
          return { rows: [{ id: staffId, provider_id: providerId, status: 'suspended' }], rowCount: 1 };
        }
        if (/INSERT INTO admin_actions/.test(sql)) {
          const serialized = params[3];
          if (typeof serialized === 'string') auditPayloads.push(JSON.parse(serialized));
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return callback(client);
  });

  await setStaffSuspension({
    staffId,
    adminId: 'admin-1',
    suspend: true,
    reason: 'Support case SUP-410 requires temporary access containment.',
  });

  expect(auditPayloads).toEqual([
    expect.objectContaining({ providerId, reason: 'Add a clearer ID photo.' }),
    expect.objectContaining({ providerId, previousStatus: 'approved', nextStatus: 'suspended' }),
  ]);
});
