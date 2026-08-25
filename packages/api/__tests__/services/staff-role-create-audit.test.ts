const dbTransactionMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createRole } from '../../src/services/staff.service';

it('Bug UX-345 — creating an operations role profile records the actor, reason, and non-authoritative access context atomically', async () => {
  const role = {
    id: 'role-1', name: 'case_reviewer', description: 'Case queue profile',
    permissions: ['support.view'], created_at: '2026-08-25', updated_at: '2026-08-25',
  };
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [role] })
    .mockResolvedValueOnce({ rows: [] });
  dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: typeof query }) => unknown) => cb({ query }));

  await createRole({
    name: 'case_reviewer',
    description: 'Case queue profile',
    permissions: ['support.view'],
    createdByAdminId: 'super-1',
    reason: 'Create a profile for the support case review queue.',
  });

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  const audit = query.mock.calls.find(([sql]) => /INSERT INTO admin_actions/.test(sql as string));
  expect(audit).toBeDefined();
  expect(audit![0]).toMatch(/'config_changed'.*'admin_role'/s);
  const params = audit![1] as unknown[];
  expect(params[0]).toBe('super-1');
  expect(params[3]).toBe('Create a profile for the support case review queue.');
  expect(JSON.parse(params[2] as string)).toMatchObject({
    changeKind: 'admin_role_profile_created',
    accessSource: 'users.role and route RBAC',
  });
});
