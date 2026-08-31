const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { computeProviderQualityScores } from '../src/services/admin-analytics.service';

it('BUG-PHASE140-01 — executed quality evidence query anchors quote and booking period boundaries to Manila', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  await computeProviderQualityScores(90);

  const executedQuery = String(dbQueryMock.mock.calls[0]?.[0]);
  expect(executedQuery).toContain("bq.created_at >= ($1::date AT TIME ZONE 'Asia/Manila')");
  expect(executedQuery).toContain("b.created_at >= ($1::date AT TIME ZONE 'Asia/Manila')");
});
