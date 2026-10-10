const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-1293 - booking identifiers use prefix matching while operator labels keep broad matching', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await listBookingsAdmin({ search: 'abc123', page: 1, pageSize: 25 });

  const listQuery = dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('SELECT b.id'));
  expect(listQuery).toBeDefined();
  const [sql, params] = listQuery as [string, unknown[]];
  expect(sql).toContain('b.id::text ILIKE $2');
  expect(sql).toContain("COALESCE(b.city, '') ILIKE $1");
  expect(params).toEqual(['%abc123%', 'abc123%', 25, 0]);
});
