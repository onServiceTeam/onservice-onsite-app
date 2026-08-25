const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { upsertBootstrapAdmin } from '../../scripts/bootstrap-admin';

it('Bug UX-352 — new admin bootstrap supplies every required identity column', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await upsertBootstrapAdmin({
    email: 'new-admin@example.test',
    passwordHash: 'scrypt:test-hash',
    role: 'admin',
    phone: '+639000000901',
    firstName: 'UX Audit',
    lastName: 'Administrator',
  });

  const [sql, params] = dbQueryMock.mock.calls[1] as [string, unknown[]];
  expect(sql).toContain('phone, first_name, last_name');
  expect(params).toEqual([
    'new-admin@example.test',
    'scrypt:test-hash',
    'admin',
    '+639000000901',
    'UX Audit',
    'Administrator',
  ]);
});
