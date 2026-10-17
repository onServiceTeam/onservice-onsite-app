// HA-M2-50 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// money-path proof. D38 changes only the job time acceptQuote writes. This
// test runs the new acceptQuote on a fixed scenario and compares every money
// value it writes against a snapshot of what the PRE-CHANGE acceptQuote wrote
// on the same scenario.
//
// The snapshot below was captured on 2026-10-14 by running acceptQuote from
// booking.service.ts exactly as committed at d7b696ec (before any P2 edit) on
// this same fixture and scenario: customer A, a quote request with two live
// quotes (provider A 83,000 and provider B 91,000 centavos), customer A a
// 'suki' member of provider A (5% discount), the fixture's 25% customer fee
// and 10% guarantee-fund rate, and provider A on the 15% founding tier. The
// capture script printed the result, the booking's money columns, both quote
// statuses and the full financial terms row. Only setting_sources' updatedAt
// stamps (the fixture's row times) are left out of the comparison.
import { bookingIntegrationIt as it, customerA, providerA, providerB } from './helpers/booking-participant-postgres';
import { requestCategory, quoteService } from './helpers/job-request-postgres';
import { upsertPlatformSetting, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { acceptQuote } from '../src/services/booking.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const booking = '83000000-0000-4000-8000-000000000501';
const winningQuote = '84000000-0000-4000-8000-000000000501';
const siblingQuote = '84000000-0000-4000-8000-000000000502';

const PRE_CHANGE_SNAPSHOT = {
  result: { quoteId: winningQuote, providerId: providerA, totalAmount: 98563 },
  booking: [{
    status: 'payment_pending', escrow_status: 'pending', provider_id: providerA,
    service_price: '78850', service_fee: '19713', total_amount: '98563', suki_discount: '4150',
  }],
  quotes: [
    { id: winningQuote, status: 'accepted', is_accepted: true },
    { id: siblingQuote, status: 'declined', is_accepted: false },
  ],
  terms: [{
    version: 1, supersedes_terms_id: null, terms_state: 'final', pricing_version: 'booking-v1',
    provider_id: providerA, provider_tier: 'founding', commission_source: 'tier_default',
    commission_rate_basis_points: 1500, service_price_centavos: '78850', service_fee_rate_basis_points: 2500,
    service_fee_min_centavos: '0', service_fee_max_centavos: '1000000', service_fee_amount_centavos: '19713',
    guarantee_fund_rate_basis_points: 1000, guarantee_fund_amount_centavos: '1971',
    commission_amount_centavos: '11828', provider_receives_centavos: '67022', platform_retains_centavos: '29570',
    total_amount_centavos: '98563', currency: 'PHP',
    cancellation_policy: {
      over24HoursPercent: 100, twoTo24HoursPercent: 75, oneToTwoHoursPercent: 50, customerNoShowPercent: 0,
      providerArrivedPercent: 0, underThirtyMinutesPercent: 0, thirtyMinutesToOneHourPercent: 25,
    },
    setting_sources: {
      service_fee_max: '1000000', service_fee_min: '0', service_fee_rate: '25', guarantee_fund_rate: '10',
      cancel_refund_1_to_2h: '50', cancel_refund_2_to_24h: '75', cancel_refund_over_24h: '100',
      cancel_refund_30min_to_1h: '25', cancel_refund_under_30min: '0', cancel_refund_customer_noshow: '0',
      cancel_refund_provider_arrived: '0',
    },
    fixed_by_event: 'quote_accepted', source_event_id: winningQuote, created_by: customerA,
    metadata: { quoteId: winningQuote, quotedPriceCentavos: 83000, sukiDiscountCentavos: 4150 },
  }],
};

it('HA-M2-50: accept writes the same price, fee, total, suki discount and terms row as the pre-change snapshot', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        description, address, barangay, city, province, latitude, longitude, scheduled_at)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Bedroom aircon drips water', '22 Mango Avenue', 'Kamputhaw',
        'Cebu City', 'Cebu', 10.3157, 123.8854, NOW() + INTERVAL '3 days')`, [booking, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, description, status, expires_at,
        earliest_date, earliest_time_window)
      VALUES ($1, $3, $4, 83000, 'Clean, re-gas and fix the drain line.', 'submitted', NOW() + INTERVAL '1 day',
        ((NOW() AT TIME ZONE 'Asia/Manila')::date + 2), 'morning'),
             ($2, $3, $5, 91000, 'Full service with a new drain pump.', 'submitted', NOW() + INTERVAL '1 day',
        ((NOW() AT TIME ZONE 'Asia/Manila')::date + 2), 'afternoon')`, [winningQuote, siblingQuote, booking, providerA, providerB]);
    await database.query(`INSERT INTO suki_memberships (customer_id, provider_id, tier) VALUES ($1, $2, 'suki')`, [customerA, providerA]);
    // Updated 2026-10-18 (customer review slice P2, D41 Q33): Suki now has an
    // off switch, suki_program_enabled, which is off by default and takes the
    // discount out entirely (CR-263 pins that). The snapshot above was taken
    // with the discount on, so this test turns the switch on to keep proving
    // that path is unchanged. The money values are not edited.
    await upsertPlatformSetting(database, 'suki_program_enabled', 'true');

    const result = await acceptQuote(booking, winningQuote, customerA);

    const terms = (await database.query(`SELECT version, supersedes_terms_id, terms_state, pricing_version, provider_id, provider_tier,
        commission_source, commission_rate_basis_points, service_price_centavos::text, service_fee_rate_basis_points,
        service_fee_min_centavos::text, service_fee_max_centavos::text, service_fee_amount_centavos::text,
        guarantee_fund_rate_basis_points, guarantee_fund_amount_centavos::text, commission_amount_centavos::text,
        provider_receives_centavos::text, platform_retains_centavos::text, total_amount_centavos::text, currency,
        cancellation_policy, setting_sources, fixed_by_event, source_event_id, created_by, metadata
      FROM booking_financial_terms WHERE booking_id = $1 ORDER BY version`, [booking])).rows;
    const actual = {
      result: { quoteId: result.quoteId, providerId: result.providerId, totalAmount: result.totalAmount },
      booking: (await database.query(`SELECT status, escrow_status, provider_id, service_price::text AS service_price,
          service_fee::text AS service_fee, total_amount::text AS total_amount, suki_discount::text AS suki_discount
        FROM bookings WHERE id = $1`, [booking])).rows,
      quotes: (await database.query(`SELECT id, status, is_accepted FROM booking_quotes WHERE booking_id = $1 ORDER BY id`, [booking])).rows,
      terms: terms.map(row => ({
        ...row,
        setting_sources: Object.fromEntries(Object.entries(row.setting_sources as Record<string, { value: string }>)
          .map(([key, source]) => [key, source.value])),
      })),
    };

    expect(actual).toEqual(PRE_CHANGE_SNAPSHOT);
    // The one intended change: the job time is the quote's window start.
    expect(result.scheduledWindow).toBe('morning');
  });
}, 90000);
