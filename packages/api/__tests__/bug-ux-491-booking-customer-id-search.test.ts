const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-491 — customer queue booking links resolve through customer and provider identifiers in booking search', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await listBookingsAdmin({ search: 'customer-uuid', page: 1, pageSize: 20 });

  const filteredQueries = dbQueryMock.mock.calls.filter(([sql]) => String(sql).includes('LEFT JOIN providers p'));
  expect(filteredQueries).toHaveLength(2);
  for (const [sql] of filteredQueries) {
    expect(sql).toContain('b.customer_id::text');
    expect(sql).toContain("COALESCE(b.provider_id::text, '')");
  }
});
