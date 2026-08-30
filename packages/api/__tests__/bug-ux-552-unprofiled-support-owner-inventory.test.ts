const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listStaff } from '../src/services/staff.service';

it('Bug UX-552 — active admin support owners remain in staff inventory even when no directory profile exists', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'user-1', profile_id: null, user_id: 'user-1', role_id: null, is_active: null,
      account_role: 'admin', account_is_active: true, active_support_cases: '2',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      total_profiles: '0', active_profiles: '0', inactive_profiles: '0',
      active_accounts: '1', inactive_accounts: '0', active_support_owners: '1',
      total_admin_accounts: '1', unprofiled_admin_accounts: '1',
    }], rowCount: 1 });

  const result = await listStaff({ page: 1, limit: 20 });

  expect(result.staff[0]).toMatchObject({
    user_id: 'user-1',
    profile_id: null,
    role_id: null,
    account_role: 'admin',
    active_support_cases: '2',
  });
  expect(result.summary.unprofiledAdminAccounts).toBe(1);
  const listSql = dbQueryMock.mock.calls[1]?.[0] as string;
  expect(listSql).toContain('FROM users u');
  expect(listSql).toContain('LEFT JOIN admin_staff');
  expect(listSql).toContain("u.role IN ('admin', 'super_admin', 'dpo')");
});
