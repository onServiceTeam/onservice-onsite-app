const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionEvidence } from '../src/services/admin-analytics.service';

it('Bug UX-832 — commission evidence averages bookings across approved providers and gross value across completed bookings', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      tier: 'verified',
      provider_count: '10',
      quality_sample_count: '6',
      avg_bookings: '4',
      avg_booking_value: '25000',
      current_rate: '0.13',
    }],
  });

  const evidence = await getCommissionEvidence();
  const verified = evidence.find((row) => row.tier === 'verified');
  const executedSql = String(dbQueryMock.mock.calls[0]?.[0]);

  expect(executedSql).toContain('AVG(COALESCE(bm.booking_count, 0))');
  expect(executedSql).toContain('SUM(COALESCE(bm.total_revenue, 0))::numeric');
  expect(verified).toMatchObject({
    providerCount: 10,
    averageCompletedBookings: 4,
    averageCompletedBookingValue: 25_000,
  });
});
