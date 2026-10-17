// CR-263 (customer review 2026-10-17, slice P2, discovery-support-2/3/14;
// D41 Q33 option a): Suki off switch on the money path. While
// suki_program_enabled is off (migration 188's default), accepting a quote
// takes no Suki discount for a customer who holds a Suki tier with that
// Service Provider: the stored service price is the quoted price, the stored
// discount is 0, and the immutable pricing terms say 0. Same request,
// quotes and Suki membership as HA-M2-50, which pins the switch-on numbers.
// Real acceptQuote, the real migrations 183 to 185 and 188, guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA, providerA, providerB } from './helpers/booking-participant-postgres';
import { requestCategory, quoteService } from './helpers/job-request-postgres';
import { readMigration, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { acceptQuote } from '../src/services/booking.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const booking = '83000000-0000-4000-8000-000000000611';
const winningQuote = '84000000-0000-4000-8000-000000000611';
const siblingQuote = '84000000-0000-4000-8000-000000000612';

it('Bug CR-263 — while Suki is off, accepting a quote stores the quoted price with no Suki discount for a Suki-tier customer', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(readMigration('188_referral_suki_invited_testers_switches.sql'));
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
    // A Suki-tier member: with the switch on, this tier takes 5% off (HA-M2-50).
    await database.query(`INSERT INTO suki_memberships (customer_id, provider_id, tier) VALUES ($1, $2, 'suki')`, [customerA, providerA]);

    const result = await acceptQuote(booking, winningQuote, customerA);

    // 83,000 quoted, no discount, plus the fixture's 25% customer fee (20,750).
    expect(result.totalAmount).toBe(103750);
    expect((await database.query(`SELECT service_price::text AS service_price, suki_discount::text AS suki_discount,
        service_fee::text AS service_fee, total_amount::text AS total_amount FROM bookings WHERE id = $1`, [booking])).rows)
      .toEqual([{ service_price: '83000', suki_discount: '0', service_fee: '20750', total_amount: '103750' }]);
    expect((await database.query(`SELECT service_price_centavos::text AS price, metadata FROM booking_financial_terms
        WHERE booking_id = $1`, [booking])).rows).toEqual([{
      price: '83000',
      metadata: { quoteId: winningQuote, quotedPriceCentavos: 83000, sukiDiscountCentavos: 0 },
    }]);
  });
}, 90000);
