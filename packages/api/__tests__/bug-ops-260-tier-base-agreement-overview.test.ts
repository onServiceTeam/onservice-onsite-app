const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { getProviderTierCommissionOverview } from '../src/services/booking-financial-terms.service';

it('Bug OPS-260 — tier overview reads effective base agreements separately from a provider-specific default', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ now: new Date('2026-09-01T00:00:00.000Z') }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1', tier: 'new' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-rate', scope_type: 'provider', rate_basis_points: 1200 }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [
      { id: 'founding-rate', tier: 'founding', scope_type: 'tier', rate_basis_points: 1000 },
      { id: 'new-rate', tier: 'new', scope_type: 'tier', rate_basis_points: 1500 },
    ], rowCount: 2 });

  const overview = await getProviderTierCommissionOverview('provider-1', ['founding', 'new']);

  expect(overview.currentProviderAgreement).toMatchObject({
    commissionRate: 0.12,
    commissionSource: 'provider_contract',
    commissionRateVersionId: 'provider-rate',
  });
  expect(overview.tierBaseRates).toEqual([
    {
      tier: 'founding', commissionRate: 0.10, commissionRateBasisPoints: 1000,
      commissionRateVersionId: 'founding-rate',
    },
    {
      tier: 'new', commissionRate: 0.15, commissionRateBasisPoints: 1500,
      commissionRateVersionId: 'new-rate',
    },
  ]);
  const tierSql = String(queryMock.mock.calls[3]?.[0]);
  expect(tierSql).toContain("crv.scope_type = 'tier'");
  expect(tierSql).toContain('crv.service_category_id IS NULL');
  expect(tierSql).toContain('commission_rate_version_cancellations');
});
