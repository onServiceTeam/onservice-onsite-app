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

import { updateRole } from '../../src/services/staff.service';

it('Bug UX-346 — editing an operations role profile stores reasoned before-and-after values in the same transaction', async () => {
  const before = {
    id: 'role-1', name: 'case_reviewer', description: 'Old scope',
    permissions: ['support.view'], created_at: '2026-08-25', updated_at: '2026-08-25',
  };
  const after = { ...before, description: 'Reviewed scope', permissions: ['support.view', 'customers.view'] };
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [before] })
    .mockResolvedValueOnce({ rows: [after] })
    .mockResolvedValueOnce({ rows: [] });
  dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: typeof query }) => unknown) => cb({ query }));

  await updateRole(
    'role-1',
    { description: 'Reviewed scope', permissions: ['support.view', 'customers.view'] },
    'super-1',
    'Align the profile labels with the current support workflow.',
  );

  const audit = query.mock.calls.find(([sql]) => /INSERT INTO admin_actions/.test(sql as string));
  expect(audit).toBeDefined();
  const params = audit![1] as unknown[];
  expect(params[0]).toBe('super-1');
  expect(params[3]).toBe('Align the profile labels with the current support workflow.');
  expect(JSON.parse(params[2] as string)).toMatchObject({
    changeKind: 'admin_role_profile_updated',
    before: { permissions: ['support.view'] },
    after: { permissions: ['support.view', 'customers.view'] },
  });
});
