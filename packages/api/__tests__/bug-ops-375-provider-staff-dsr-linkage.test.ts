const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listDsrs } from '../src/services/compliance.service';

it('Bug OPS-375 — provider-staff privacy cases resolve their employing Provider 360 record', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ cnt: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'dsr-1',
        user_id: 'staff-user-1',
        user_email: 'staff@example.test',
        user_role: 'provider_staff',
        provider_profile_id: 'provider-1',
        request_type: 'access',
        status: 'received',
        received_at: new Date('2026-09-01T00:00:00.000Z'),
        due_at: new Date('2026-09-16T00:00:00.000Z'),
        completed_at: null,
        handled_by: null,
        user_message: 'Please provide my data.',
        admin_notes: null,
        response_payload_url: null,
        rejection_reason: null,
      }],
      rowCount: 1,
    });

  const result = await listDsrs({ limit: 25, offset: 0 });

  expect(result.rows[0]).toMatchObject({
    userId: 'staff-user-1',
    userRole: 'provider_staff',
    providerProfileId: 'provider-1',
  });
  const rowSql = queryMock.mock.calls[1][0] as string;
  expect(rowSql).toMatch(/FROM provider_staff ps/);
  expect(rowSql).toMatch(/COALESCE\(p\.id, staff_account\.provider_id\) AS provider_profile_id/);
});
