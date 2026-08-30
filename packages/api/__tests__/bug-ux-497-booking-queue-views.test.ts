const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-497 — shareable booking views apply the matching canonical exception predicate to count and result queries', async () => {
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });

  await listBookingsAdmin({ view: 'unassigned', page: 1, pageSize: 20 });
  let filteredSql = dbQueryMock.mock.calls.filter(([sql]) => String(sql).includes('LEFT JOIN providers p')).map(([sql]) => String(sql));
  expect(filteredSql).toHaveLength(2);
  expect(filteredSql.every((sql) => sql.includes("b.provider_id IS NULL AND b.status = 'paid'"))).toBe(true);

  dbQueryMock.mockClear();
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  await listBookingsAdmin({ view: 'support', page: 1, pageSize: 20 });
  filteredSql = dbQueryMock.mock.calls.filter(([sql]) => String(sql).includes('LEFT JOIN providers p')).map(([sql]) => String(sql));
  expect(filteredSql.every((sql) => sql.includes('st.booking_id = b.id') && sql.includes("st.status NOT IN ('resolved', 'closed')"))).toBe(true);
});
