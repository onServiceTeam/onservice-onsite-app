const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { computeProviderQualityScores } from '../src/services/admin-analytics.service';

it('BUG-PHASE185-01 — stored quality period uses the Manila calendar date across the UTC day boundary', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-31T17:00:00.000Z'));
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      provider_id: 'provider-1', avg_rating: '5', total_jobs: '1', completed_jobs: '1',
      cancelled_by_provider: '0', on_time_jobs: '1', avg_response_minutes: null, quote_count: '0',
    }] })
    .mockResolvedValueOnce({ rows: [] });

  try {
    await computeProviderQualityScores(1);
  } finally {
    jest.useRealTimers();
  }

  const insertParameters = dbQueryMock.mock.calls[1]?.[1] as unknown[];
  expect(insertParameters[8]).toBe('2026-08-31');
  expect(insertParameters[9]).toBe('2026-09-01');
});
