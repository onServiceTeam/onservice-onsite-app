const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listProviders } from '../src/services/admin.service';

it('Bug OPS-372 — provider search resolves person names and provider or owner IDs for support handoff', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] });
  const ownerId = '11111111-1111-4111-8111-111111111111';

  const result = await listProviders({ search: ownerId, page: 1, pageSize: 20 });
  const [countSql, countParams] = queryMock.mock.calls[0] as [string, unknown[]];
  const [dataSql, dataParams] = queryMock.mock.calls[1] as [string, unknown[]];

  for (const sql of [countSql, dataSql]) {
    expect(sql).toContain("CONCAT_WS(' ', u.first_name, u.last_name)");
    expect(sql).toContain('p.id::text ILIKE $1');
    expect(sql).toContain('u.id::text ILIKE $1');
  }
  expect(countParams).toEqual([`%${ownerId}%`]);
  expect(dataParams).toEqual([`%${ownerId}%`, 20, 0]);
  expect(result.total).toBe(1);
});
