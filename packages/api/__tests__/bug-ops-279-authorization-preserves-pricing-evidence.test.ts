import { appendAuthorizationTermsInTransaction } from '../src/services/booking-financial-terms.service';

const previous = {
  id: 'terms-before-payment', booking_id: 'booking-279', version: 1,
  supersedes_terms_id: null, terms_state: 'final', pricing_version: 'booking-v1',
  provider_id: 'provider-279', provider_tier: 'pro', commission_source: 'provider_contract',
  commission_rate_version_id: 'rate-279', commission_rate_basis_points: 1250,
  service_price_centavos: '10000', service_fee_rate_basis_points: 500,
  service_fee_min_centavos: '100', service_fee_max_centavos: '50000',
  service_fee_amount_centavos: '500', guarantee_fund_rate_basis_points: 100,
  guarantee_fund_amount_centavos: '5', commission_amount_centavos: '1250',
  provider_receives_centavos: '8750', platform_retains_centavos: '1745',
  total_amount_centavos: '10500', currency: 'PHP',
  cancellation_policy: {
    over24HoursPercent: 100, twoTo24HoursPercent: 75, oneToTwoHoursPercent: 50,
    thirtyMinutesToOneHourPercent: 25, underThirtyMinutesPercent: 0,
    providerArrivedPercent: 0, customerNoShowPercent: 0,
  },
  setting_sources: { service_fee_rate: { value: '5', updatedAt: '2026-09-01T00:00:00.000Z' } },
  fixed_by_event: 'quote_accepted', source_event_id: 'quote-279',
  fixed_at: new Date('2026-09-01T00:00:00.000Z'), created_by: 'customer-279', metadata: {},
};

it('Bug OPS-279 — authorization carries accepted pricing evidence instead of rereading live settings', async () => {
  let insertParams: unknown[] = [];
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (/FROM bookings/.test(sql)) return { rows: [{
        id: 'booking-279', provider_id: 'provider-279', category_id: 'category-1',
        subcategory_id: 'subcategory-1', status: 'payment_pending', escrow_status: 'not_held',
        service_price: '10000', service_fee: '500', total_amount: '10500',
      }], rowCount: 1 };
      if (/fixed_by_event = \$2/.test(sql)) return { rows: [], rowCount: 0 };
      if (/ORDER BY version DESC/.test(sql)) return { rows: [previous], rowCount: 1 };
      if (/clock_timestamp/.test(sql)) return { rows: [{ now: new Date('2026-09-01T02:00:00.000Z') }], rowCount: 1 };
      if (/INSERT INTO booking_financial_terms/.test(sql)) {
        insertParams = params ?? [];
        return { rows: [{
          ...previous, id: 'terms-authorized', version: 2, supersedes_terms_id: previous.id,
          fixed_by_event: 'external_payment_authorized', source_event_id: 'intent-279',
          fixed_at: params?.[24], created_by: 'customer-279',
          cancellation_policy: JSON.parse(String(params?.[20])),
          setting_sources: JSON.parse(String(params?.[21])),
          metadata: JSON.parse(String(params?.[26])),
        }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };

  const terms = await appendAuthorizationTermsInTransaction(client, {
    bookingId: 'booking-279', event: 'external_payment_authorized',
    sourceEventId: 'intent-279', createdBy: 'customer-279',
  });

  expect(terms.version).toBe(2);
  expect(terms.commissionRateVersionId).toBe('rate-279');
  expect(insertParams[10]).toBe(500);
  expect(client.query.mock.calls.some(([sql]) => /platform_settings/.test(String(sql)))).toBe(false);
  expect(client.query.mock.calls.some(([sql]) => /commission_rate_versions crv/.test(String(sql)))).toBe(false);
});
