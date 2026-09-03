const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/services/booking-financial-terms.service', () => ({
  getProviderTierCommissionOverview: jest.fn(async () => ({
    currentProviderAgreement: {
      commissionRate: 0.11,
      commissionSource: 'tier_default',
      commissionRateVersionId: 'pro-rate',
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

it('MED-N24 — tier progression counts every non-resolved dispute through the provider booking relationship', async () => {
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(b.id) FILTER')) return result([{ tier: 'pro', completed_jobs: 30, rating: '4.8' }]);
    if (sql.includes('FROM provider_certifications')) return result([{ count: '1' }]);
    if (sql.includes('FROM disputes d')) {
      expect(sql).toContain('JOIN bookings b ON b.id = d.booking_id');
      expect(sql).toContain("d.status <> 'resolved'");
      expect(sql).not.toContain('dismissed');
      return result([{ count: '2' }]);
    }
    return result([]);
  });

  const progression = await getTierProgression('provider-1');

  expect(progression.progress.openDisputeCount).toBe(2);
  expect(progression.requirements?.disputes).toEqual({ required: true, current: 2, met: false });
});
