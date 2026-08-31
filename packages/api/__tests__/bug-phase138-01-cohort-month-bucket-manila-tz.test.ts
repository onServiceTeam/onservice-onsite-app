const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getCohortAnalysis } from '../src/services/admin-analytics.service';

it('BUG-PHASE138-01 — executed retention and booking-value cohorts bucket account and booking months in Manila', async () => {
  dbQueryMock.mockResolvedValue({ rows: [] });

  await getCohortAnalysis(6, 'retention');
  await getCohortAnalysis(6, 'revenue');

  const retentionQuery = String(dbQueryMock.mock.calls[0]?.[0]);
  const bookingValueQuery = String(dbQueryMock.mock.calls[1]?.[0]);
  for (const executedQuery of [retentionQuery, bookingValueQuery]) {
    expect(executedQuery).toContain("DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Manila')");
    expect(executedQuery).toContain("DATE_TRUNC('month', b.created_at AT TIME ZONE 'Asia/Manila')");
  }
});
