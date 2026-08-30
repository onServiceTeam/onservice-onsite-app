const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-464 — booking search resolves customer, provider, service, city, and booking identifiers in both count and result queries', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await listBookingsAdmin({ search: 'Cebu Home Pro', page: 1, pageSize: 25 });

  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  for (const [sql, params] of dbQueryMock.mock.calls) {
    expect(sql).toContain('LEFT JOIN providers p');
    expect(sql).toContain('LEFT JOIN users pu');
    expect(sql).toContain('LEFT JOIN service_categories sc');
    expect(sql).toContain("CONCAT_WS(' ', u.first_name, u.last_name)");
    expect(sql).toContain('p.business_name');
    expect(sql).toContain('sc.name');
    expect(params[0]).toBe('%Cebu Home Pro%');
  }
});
