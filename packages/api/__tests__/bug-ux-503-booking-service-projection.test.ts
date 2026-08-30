const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-503 — booking operations searches and displays the specific service before falling back to its broad category', async () => {
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  await listBookingsAdmin({ search: 'Split-type aircon cleaning', page: 1, pageSize: 20 });
  const filteredSql = dbQueryMock.mock.calls.filter(([sql]) => String(sql).includes('LEFT JOIN providers p')).map(([sql]) => String(sql));
  const dataSql = filteredSql.find((sql) => sql.includes('SELECT b.id')) ?? '';

  expect(filteredSql).toHaveLength(2);
  expect(filteredSql.every((sql) => sql.includes('LEFT JOIN service_subcategories ss ON ss.id = b.subcategory_id'))).toBe(true);
  expect(filteredSql.every((sql) => sql.includes("COALESCE(ss.name, '') ILIKE"))).toBe(true);
  expect(dataSql).toContain('COALESCE(ss.name, sc.name) AS category_name');
});
