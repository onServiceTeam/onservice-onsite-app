const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getRevenueReport } from '../src/services/admin.service';

it('MED-N76 - revenue period selection executes only the three static date-truncation fragments', async () => {
  mockDbQuery.mockResolvedValue({ rows: [], rowCount: 0 });

  await getRevenueReport('daily', 7);
  await getRevenueReport('weekly', 30);
  await getRevenueReport('monthly', 365);

  expect(mockDbQuery).toHaveBeenCalledTimes(3);
  expect(mockDbQuery.mock.calls[0]![0]).toContain("date_trunc('day', wt.created_at)");
  expect(mockDbQuery.mock.calls[1]![0]).toContain("date_trunc('week', wt.created_at)");
  expect(mockDbQuery.mock.calls[2]![0]).toContain("date_trunc('month', wt.created_at)");
  expect(mockDbQuery.mock.calls.map((call) => call[1])).toEqual([[7], [30], [365]]);
  for (const [sql] of mockDbQuery.mock.calls) {
    expect(sql).not.toContain('${');
  }
});
