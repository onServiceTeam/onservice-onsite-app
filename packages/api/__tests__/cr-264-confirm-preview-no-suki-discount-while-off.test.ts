// CR-264 (customer review 2026-10-17, slice P2, discovery-support-2/3/14;
// D41 Q33 option a): Suki off switch on the confirm screen. While
// suki_program_enabled is off, the quote confirm preview shows no Suki
// discount for a Suki-tier customer: the service price is the quoted price
// and the total is that price plus the fee, the same numbers acceptQuote
// stores (CR-263). Real getQuoteConfirmPreview, the real migrations 183 to
// 185 and 188 on the request-flow fixture (it adds the photo and review
// columns the preview reads), guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { readMigration } from './helpers/request-engine-postgres';
import { customerA, providerA, quoteService, requestCategory, withRequestFlowDatabase } from './helpers/request-flow-postgres';
import { getQuoteConfirmPreview } from '../src/services/booking.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const booking = '83000000-0000-4000-8000-000000000621';
const quote = '84000000-0000-4000-8000-000000000621';

it('Bug CR-264 — while Suki is off, the confirm preview shows the quoted price with no Suki discount', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query(readMigration('188_referral_suki_invited_testers_switches.sql'));
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        description, address, barangay, city, province, latitude, longitude, scheduled_at)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Bedroom aircon drips water', '22 Mango Avenue', 'Kamputhaw',
        'Cebu City', 'Cebu', 10.3157, 123.8854, NOW() + INTERVAL '3 days')`, [booking, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, description, status, expires_at,
        earliest_date, earliest_time_window)
      VALUES ($1, $2, $3, 83000, 'Clean, re-gas and fix the drain line.', 'submitted', NOW() + INTERVAL '1 day',
        ((NOW() AT TIME ZONE 'Asia/Manila')::date + 2), 'morning')`, [quote, booking, providerA]);
    await database.query(`INSERT INTO suki_memberships (customer_id, provider_id, tier) VALUES ($1, $2, 'suki')`, [customerA, providerA]);

    const preview = await getQuoteConfirmPreview(booking, quote, customerA);

    expect({
      quotedPrice: preview.quotedPrice,
      sukiDiscount: preview.sukiDiscount,
      servicePrice: preview.servicePrice,
      serviceFee: preview.serviceFee,
      totalAmount: preview.totalAmount,
    }).toEqual({ quotedPrice: 83000, sukiDiscount: 0, servicePrice: 83000, serviceFee: 20750, totalAmount: 103750 });
  });
}, 90000);
