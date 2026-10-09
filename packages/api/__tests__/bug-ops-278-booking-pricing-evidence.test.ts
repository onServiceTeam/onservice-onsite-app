import { appendPricingTermsInTransaction } from '../src/services/booking-financial-terms.service';

const booking = {
  id: 'booking-278',
  provider_id: null,
  category_id: 'category-1',
  subcategory_id: 'subcategory-1',
  status: 'requested',
  escrow_status: 'not_held',
  service_price: '10000',
  service_fee: '500',
  total_amount: '10500',
};

const settings = [
  ['service_fee_rate', '5'],
  ['service_fee_min', '100'],
  ['service_fee_max', '50000'],
  ['guarantee_fund_rate', '1'],
  ['cancel_refund_over_24h', '100'],
  ['cancel_refund_2_to_24h', '75'],
  ['cancel_refund_1_to_2h', '50'],
  ['cancel_refund_30min_to_1h', '25'],
  ['cancel_refund_under_30min', '0'],
  ['cancel_refund_provider_arrived', '0'],
  ['cancel_refund_customer_noshow', '0'],
].map(([key, value]) => ({ key, value, updated_at: new Date('2026-09-01T00:00:00.000Z') }));

it('Bug OPS-278 — fixed-price creation records fee and cancellation evidence before payment', async () => {
  let insertParams: unknown[] = [];
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (/FROM bookings/.test(sql)) return { rows: [booking], rowCount: 1 };
      if (/fixed_by_event = \$2/.test(sql)) return { rows: [], rowCount: 0 };
      if (/ORDER BY version DESC/.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM platform_settings/.test(sql)) return { rows: settings, rowCount: settings.length };
      if (/clock_timestamp/.test(sql)) return { rows: [{ now: new Date('2026-09-01T01:00:00.000Z') }], rowCount: 1 };
      if (/INSERT INTO booking_financial_terms/.test(sql)) {
        insertParams = params ?? [];
        return {
          rows: [{
            id: 'terms-278', booking_id: booking.id, version: 1,
            supersedes_terms_id: null, terms_state: 'provisional', pricing_version: 'booking-v1',
            provider_id: null, provider_tier: null, commission_source: null,
            commission_rate_version_id: null, commission_rate_basis_points: null,
            service_price_centavos: '10000', service_fee_rate_basis_points: 500,
            service_fee_min_centavos: '100', service_fee_max_centavos: '50000',
            service_fee_amount_centavos: '500', guarantee_fund_rate_basis_points: 100,
            guarantee_fund_amount_centavos: '5', commission_amount_centavos: null,
            provider_receives_centavos: null, platform_retains_centavos: null,
            total_amount_centavos: '10500', currency: 'PHP',
            cancellation_policy: JSON.parse(String(params?.[20])),
            setting_sources: JSON.parse(String(params?.[21])), fixed_by_event: 'booking_priced',
            source_event_id: booking.id, fixed_at: params?.[24], created_by: 'customer-278',
            metadata: JSON.parse(String(params?.[26])),
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };

  const terms = await appendPricingTermsInTransaction(client, {
    bookingId: booking.id,
    event: 'booking_priced',
    sourceEventId: booking.id,
    createdBy: 'customer-278',
  });

  expect(terms.termsState).toBe('provisional');
  expect(terms.serviceFeeRateBasisPoints).toBe(500);
  expect(terms.serviceFeeAmountCentavos).toBe(500);
  expect(insertParams[22]).toBe('booking_priced');
  expect(insertParams[25]).toBe('customer-278');
});
