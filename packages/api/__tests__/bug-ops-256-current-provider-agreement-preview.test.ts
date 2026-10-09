const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { getCurrentProviderCommissionPreview } from '../src/services/booking-financial-terms.service';

it('Bug OPS-256 — provider profile commission comes from the effective agreement table', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ now: new Date('2026-09-01T00:00:00.000Z') }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1', tier: 'verified' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'rate-1', scope_type: 'provider', rate_basis_points: 1275,
      effective_from: new Date('2026-08-01T00:00:00.000Z'), source: 'provider_contract',
    }], rowCount: 1 });

  await expect(getCurrentProviderCommissionPreview('provider-1')).resolves.toEqual({
    providerTier: 'verified',
    commissionRate: 0.1275,
    commissionRateBasisPoints: 1275,
    commissionSource: 'provider_contract',
    commissionRateVersionId: 'rate-1',
    isFixedForBooking: false,
    termsVersion: null,
  });
  expect(String(queryMock.mock.calls[2]?.[0])).toContain('commission_rate_versions');
});
