const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { searchDpoCandidates } from '../../src/services/staff.service';

it('Bug UX-348 — DPO candidate search only returns active admin accounts and escapes search wildcards', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  await searchDpoCandidates('an%_', 50);

  const [sql, params] = dbQueryMock.mock.calls[0] as [string, unknown[]];
  expect(sql).toMatch(/u\.role = 'admin'/);
  expect(sql).toMatch(/u\.is_active = TRUE/);
  expect(params).toEqual(['%an\\%\\_%', 20]);
});
