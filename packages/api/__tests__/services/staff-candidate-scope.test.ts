const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { searchStaffCandidates } from '../../src/services/staff.service';

describe('Staff directory candidate scope', () => {
  beforeEach(() => dbQueryMock.mockReset());

  it('Bug UX-342 — candidate search is limited to active admin-tier accounts not already profiled and escapes wildcards', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    await searchStaffCandidates('an%_', 50);

    const [sql, params] = dbQueryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/u\.role IN \('admin', 'super_admin', 'dpo'\)/);
    expect(sql).toMatch(/u\.is_active = TRUE/);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*admin_staff/);
    expect(params).toEqual(['%an\\%\\_%', 20]);
  });
});
