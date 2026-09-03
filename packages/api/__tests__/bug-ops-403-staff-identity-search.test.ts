const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listStaff } from '../src/services/staff.service';

it('Bug OPS-403 — staff directory search accepts exact login-account and directory-profile identities', async () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const profileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const queueDirectoryResult = (): void => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: profileId,
          profile_id: profileId,
          user_id: userId,
          role_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          is_active: true,
          account_role: 'admin',
          account_is_active: true,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          total_profiles: '1', active_profiles: '1', inactive_profiles: '0',
          active_accounts: '1', inactive_accounts: '0', active_support_owners: '1',
          total_admin_accounts: '1', unprofiled_admin_accounts: '0',
        }],
        rowCount: 1,
      });
  };
  queueDirectoryResult();
  queueDirectoryResult();

  const byUser = await listStaff({ page: 1, limit: 20, search: userId });
  const byProfile = await listStaff({ page: 1, limit: 20, search: profileId });

  expect(byUser.staff[0]).toMatchObject({
    profile_id: profileId,
    user_id: userId,
  });
  expect(byProfile.staff[0]).toMatchObject({
    profile_id: profileId,
    user_id: userId,
  });
  expect(byUser.total).toBe(1);
  expect(byProfile.total).toBe(1);
  for (const callIndex of [0, 1, 3, 4]) {
    const sql = dbQueryMock.mock.calls[callIndex]?.[0] as string;
    expect(sql).toContain('u.id::text ILIKE $1');
    expect(sql).toContain("COALESCE(ast.id::text, '') ILIKE $1");
  }
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([`%${userId}%`]);
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual([`%${userId}%`, 20, 0]);
  expect(dbQueryMock.mock.calls[3]?.[1]).toEqual([`%${profileId}%`]);
  expect(dbQueryMock.mock.calls[4]?.[1]).toEqual([`%${profileId}%`, 20, 0]);
});
