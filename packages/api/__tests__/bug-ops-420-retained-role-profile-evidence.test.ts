const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getRoleEvidenceById } from '../src/services/staff.service';

it('Bug OPS-420 - exact role-profile evidence includes a retained archived profile and assignment counts', async () => {
  const roleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: roleId,
    name: 'legacy_moderator',
    description: 'Retained historical operations profile',
    permissions: ['support.view'],
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    deleted_at: '2026-09-03T00:00:00.000Z',
    deleted_reason: 'Profile replaced by the case review role.',
    active_staff_count: '0',
    historical_staff_count: '3',
  }] });

  const role = await getRoleEvidenceById(roleId);

  expect(role).toMatchObject({
    id: roleId,
    deleted_reason: 'Profile replaced by the case review role.',
    active_staff_count: '0',
    historical_staff_count: '3',
  });
  const [sql, params] = dbQueryMock.mock.calls[0] as [string, unknown[]];
  expect(sql).toContain('FROM admin_roles ar');
  expect(sql).toContain('AS active_staff_count');
  expect(sql).toContain('AS historical_staff_count');
  expect(sql).not.toContain('ar.deleted_at IS NULL');
  expect(params).toEqual([roleId]);
});
