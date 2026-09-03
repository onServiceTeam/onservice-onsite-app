const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionEvidence } from '../src/services/admin-analytics.service';
import { platformConfig } from '../src/config/platform.config';

it('Bug UX-832 — commission evidence averages bookings across approved providers and gross value across completed bookings', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: Object.keys(platformConfig.commissionRates).map((tier) => ({
      tier,
      provider_count: tier === 'verified' ? '10' : '0',
      quality_sample_count: tier === 'verified' ? '6' : '0',
      avg_bookings: tier === 'verified' ? '4' : '0',
      avg_booking_value: tier === 'verified' ? '25000' : '0',
      current_rate: String(platformConfig.commissionRates[tier]),
    })),
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
