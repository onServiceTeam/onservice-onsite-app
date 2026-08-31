const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { computeProviderQualityScores } from '../src/services/admin-analytics.service';

it('Bug UX-829 — resolved completed work remains in the quality evidence source instead of disappearing from completion counts', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  await computeProviderQualityScores(90);

  const executedQuery = String(dbQueryMock.mock.calls[0]?.[0]);
  expect(executedQuery).toContain("'confirmed', 'resolved', 'payout_ready', 'paid_out'");
});
