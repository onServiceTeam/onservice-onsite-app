const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { listDisputes } from '../src/services/dispute.service';

it('Bug UX-511 — dispute service applies exact active and stale queue predicates to both count and row queries', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({ rows: [] });

  await listDisputes({ view: 'active', page: 1, pageSize: 20 });
  await listDisputes({ view: 'stale', page: 1, pageSize: 20 });

  const activeCountSql = String(dbQueryMock.mock.calls[0]?.[0]);
  const activeRowsSql = String(dbQueryMock.mock.calls[1]?.[0]);
  const staleCountSql = String(dbQueryMock.mock.calls[2]?.[0]);
  const staleRowsSql = String(dbQueryMock.mock.calls[3]?.[0]);
  expect(activeCountSql).toContain("d.status IN ('open', 'under_review', 'escalated')");
  expect(activeRowsSql).toContain("d.status IN ('open', 'under_review', 'escalated')");
  expect(staleCountSql).toContain("d.status = 'open' AND d.created_at < NOW() - INTERVAL '48 hours'");
  expect(staleRowsSql).toContain("d.status = 'open' AND d.created_at < NOW() - INTERVAL '48 hours'");
});
