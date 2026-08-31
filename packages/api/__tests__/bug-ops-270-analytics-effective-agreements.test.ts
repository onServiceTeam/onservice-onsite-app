const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { platformConfig } from '../src/config/platform.config';
import { getCommissionEvidence } from '../src/services/admin-analytics.service';

it('Bug OPS-270 — admin commission evidence reads effective tier agreements and excludes legacy booking evidence', async () => {
  const tiers = Object.keys(platformConfig.commissionRates);
  queryMock.mockResolvedValueOnce({
    rows: tiers.map((tier) => ({
      tier,
      provider_count: '2',
      quality_sample_count: '2',
      avg_bookings: '3',
      avg_booking_value: '100000',
      current_rate: '0.12',
    })),
    rowCount: tiers.length,
  });

  const result = await getCommissionEvidence();

  const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
  expect(sql).toContain('commission_rate_versions');
  expect(sql).toContain("crv.scope_type = 'tier'");
  expect(sql).toContain('commission_rate_version_cancellations');
  expect(sql).not.toContain('platform_settings');
  expect(params).toEqual([tiers]);
  expect(result.every((row) => row.currentRate === 0.12)).toBe(true);
});
