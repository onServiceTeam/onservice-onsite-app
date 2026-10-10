const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { getBookingCommissionPreview } from '../src/services/booking-financial-terms.service';

it('Bug OPS-271 — a legacy-reviewed booking preview preserves its booking-specific evidence source', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', provider_id: 'provider-1', category_id: 'category-1', subcategory_id: null,
      status: 'paid', escrow_status: 'held', service_price: '100000', service_fee: '10000',
      total_amount: '110000',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ allowed: true }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'terms-1', booking_id: 'booking-1', version: 1, supersedes_terms_id: null,
      terms_state: 'final', pricing_version: 'booking-v1', provider_id: 'provider-1',
      provider_tier: 'verified', commission_source: 'legacy_review',
      commission_rate_version_id: 'booking-evidence-1', commission_rate_basis_points: 1300,
      service_price_centavos: '100000', service_fee_rate_basis_points: 1000,
      service_fee_min_centavos: '0', service_fee_max_centavos: '50000',
      service_fee_amount_centavos: '10000', guarantee_fund_rate_basis_points: 150,
      guarantee_fund_amount_centavos: '150', commission_amount_centavos: '13000',
      provider_receives_centavos: '87000', platform_retains_centavos: '22850',
      total_amount_centavos: '110000', currency: 'PHP', cancellation_policy: {},
      setting_sources: {}, fixed_by_event: 'legacy_reviewed_backfill', source_event_id: 'booking-1',
      fixed_at: new Date('2026-08-01T00:00:00.000Z'), created_by: 'admin-1', metadata: {},
    }], rowCount: 1 });

  await expect(getBookingCommissionPreview('provider-1', 'booking-1')).resolves.toMatchObject({
    commissionSource: 'legacy_review',
    commissionRateVersionId: 'booking-evidence-1',
    isFixedForBooking: true,
  });
});
