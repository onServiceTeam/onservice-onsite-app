const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listStaff } from '../src/services/staff.service';

it('Bug UX-541 — the staff directory returns real account login, role, status, workload, and summary truth', async () => {
  const login = new Date('2026-08-30T03:15:00.000Z');
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'staff-1', user_id: 'user-1', role_id: 'profile-1', is_active: true,
      last_login_at: login, account_role: 'admin', account_is_active: true,
      active_support_cases: '3', role_name: 'support_agent',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      total_profiles: '4', active_profiles: '3', inactive_profiles: '1',
      active_accounts: '2', inactive_accounts: '2', active_support_owners: '2',
      total_admin_accounts: '4', unprofiled_admin_accounts: '1',
    }], rowCount: 1 });

  const result = await listStaff({ page: 1, limit: 20 });

  expect(result.staff[0]).toMatchObject({
    last_login_at: login,
    account_role: 'admin',
    account_is_active: true,
    active_support_cases: '3',
  });
  expect(result.summary).toEqual({
    totalProfiles: 4,
    activeProfiles: 3,
    inactiveProfiles: 1,
    activeAccounts: 2,
    inactiveAccounts: 2,
    activeSupportOwners: 2,
    totalAdminAccounts: 4,
    unprofiledAdminAccounts: 1,
  });
  const staffSql = dbQueryMock.mock.calls[1]?.[0] as string;
  expect(staffSql).toContain('u.last_login_at AS last_login_at');
  expect(staffSql).toContain('st.assigned_agent_id = u.id');
});
