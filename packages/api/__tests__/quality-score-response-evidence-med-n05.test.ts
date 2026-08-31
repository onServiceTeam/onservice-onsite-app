const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { computeProviderQualityScores } from '../src/services/admin-analytics.service';

it('MED-N05 — quality snapshot computation derives the response component from quote response evidence', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      provider_id: 'provider-1', avg_rating: '4.5', total_jobs: '10', completed_jobs: '9',
      cancelled_by_provider: '1', on_time_jobs: '8', avg_response_minutes: '45', quote_count: '4',
    }] })
    .mockResolvedValueOnce({ rows: [] });

  const count = await computeProviderQualityScores(90);

  expect(count).toBe(1);
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  expect(dbQueryMock.mock.calls[1]?.[1]?.[6]).toBe(90);
});
