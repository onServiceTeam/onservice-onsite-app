const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../../src/services/booking-financial-terms.service', () => ({
  getProviderTierCommissionOverview: jest.fn(async () => ({
    currentProviderAgreement: {
      commissionRate: 0.15,
      commissionSource: 'tier_default',
      commissionRateVersionId: 'new-rate',
    },
    tierBaseRates: [
      ['founding', 0.10], ['new', 0.15], ['verified', 0.13], ['pro', 0.11], ['elite', 0.09],
    ].map(([tier, commissionRate]) => ({ tier, commissionRate })),
  })),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getTierProgression } from '../../src/services/provider.service';

function result(rows: unknown[]): Record<string, unknown> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

it('Bug UX-325 — provider tier eligibility counts canonical completed bookings instead of the stale provider counter', async () => {
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (/SELECT p\.tier, p\.rating[\s\S]*FROM providers p/.test(sql)) {
      expect(sql).toContain("b.status IN ('confirmed', 'resolved', 'payout_ready', 'paid_out')");
      return result([{ tier: 'new', completed_jobs: 6, rating: '4.10' }]);
    }
    return result([{ count: '0' }]);
  });

  const data = await getTierProgression('provider-1');

  expect(data.progress.totalJobs).toBe(6);
  expect(data.requirements?.jobs).toEqual({ current: 6, required: 5, met: true });
});
