const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionEvidence } from '../src/services/admin-analytics.service';
import { platformConfig } from '../src/config/platform.config';

it('MED-N06 — commission evidence reads every current tier rate in one aggregate query', async () => {
  const tiers = Object.keys(platformConfig.commissionRates);
  dbQueryMock.mockResolvedValueOnce({
    rows: tiers.map((tier) => ({
      tier,
      provider_count: '0',
      quality_sample_count: '0',
      avg_bookings: '0',
      avg_booking_value: '0',
      current_rate: '0.12',
    })),
  });

  const evidence = await getCommissionEvidence();

  expect(dbQueryMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock.mock.calls[0]?.[0]).toContain('commission_rate_versions');
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([tiers]);
  expect(evidence).toHaveLength(tiers.length);
  expect(evidence.every((row) => row.currentRate === 0.12)).toBe(true);
});
