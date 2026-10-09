const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { getBookingCommissionPreview } from '../src/services/booking-financial-terms.service';

it('Bug OPS-257 — a paid job preview uses its fixed terms without reading today’s commission schedule', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', provider_id: 'provider-1', category_id: 'category-1', subcategory_id: null,
      status: 'paid', escrow_status: 'held', service_price: '100000', service_fee: '10000', total_amount: '110000',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ allowed: true }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'terms-3', booking_id: 'booking-1', version: 3, supersedes_terms_id: 'terms-2',
      terms_state: 'final', pricing_version: 'booking-v1', provider_id: 'provider-1',
      provider_tier: 'pro', commission_source: 'tier_default', commission_rate_version_id: 'rate-old',
      commission_rate_basis_points: 1100, service_price_centavos: '100000',
      service_fee_rate_basis_points: 1000, service_fee_min_centavos: '0', service_fee_max_centavos: '50000',
      service_fee_amount_centavos: '10000', guarantee_fund_rate_basis_points: 150,
      guarantee_fund_amount_centavos: '150', commission_amount_centavos: '11000',
      provider_receives_centavos: '89000', platform_retains_centavos: '20850',
      total_amount_centavos: '110000', currency: 'PHP', cancellation_policy: {}, setting_sources: {},
      fixed_by_event: 'provider_assigned', source_event_id: 'offer-1',
      fixed_at: new Date('2026-08-01T00:00:00.000Z'), created_by: null, metadata: {},
    }], rowCount: 1 });

  await expect(getBookingCommissionPreview('provider-1', 'booking-1')).resolves.toMatchObject({
    providerTier: 'pro',
    commissionRate: 0.11,
    commissionRateVersionId: 'rate-old',
    isFixedForBooking: true,
    termsVersion: 3,
  });
  expect(queryMock).toHaveBeenCalledTimes(3);
  expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('commission_rate_versions'))).toBe(false);
});
