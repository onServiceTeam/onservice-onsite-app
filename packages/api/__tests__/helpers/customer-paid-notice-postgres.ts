// R-NOT-01 helpers (repair list 2026-10-14): the provider's "customer paid"
// notice on the guarded PostgreSQL request-flow fixture.
//
// acceptedQuoteBooking runs the D38 main path through the mounted routes:
// a request, provider A's quote (a morning slot two days out, from
// quoteBody), and customer A's acceptance. acceptQuote leaves the booking at
// payment_pending with provider A assigned, which is the state the customer
// then pays from the wallet.
//
// matchedBookingAwaitingGatewayPayment is the state a card or GCash payment
// (the webhook path) can reach with a provider already on the booking, and
// enableOfferDispatch lets the real after-payment offer flow run.
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import bookingRouter from '../../src/routes/booking.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { canTransition } from '../../src/types/booking.types';
import { kickOfferCycle } from '../../src/services/booking-offer.service';
import { syntheticSecret } from './booking-participant-postgres';
import {
  flowHttp, insertQuoteRequest, quoteBody, customerA, providerA, providerUserA,
} from './request-flow-postgres';
import { readMigration } from './request-engine-postgres';
import { fixedService } from './job-request-postgres';

/** The provider accepts a dispatch offer through the mounted booking route. */
export function acceptOfferAs(providerUserId: string, offerId: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/bookings', bookingRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: providerUserId, role: 'provider', sessionVersion: 1, type: 'access' },
    syntheticSecret, { expiresIn: '5m' });
  return request(app).post(`/api/v1/bookings/offers/${offerId}/accept`)
    .set('Authorization', `Bearer ${token}`).send({});
}

/**
 * Let the real dispatch offer flow run on this fixture: the matcher reads
 * provider_availability (migration 010) and provider_availability_overrides
 * (migration 043), which the request-flow fixture does not create. Both are
 * applied from the real migration files, and provider A is given open hours
 * every day, so provider A is the one eligible match (provider B has no
 * hours).
 */
export async function enableOfferDispatch(database: Pool): Promise<void> {
  await database.query(readMigration('010_create_addresses.sql'));
  await database.query(readMigration('043_availability_overrides.sql'));
  await database.query(`INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time)
    SELECT $1, day, '00:00', '23:59:59' FROM generate_series(0, 6) AS day`, [providerA]);
}

/** A fixed-price Aircon cleaning booking (40,000 + 10,000 fee) with no provider yet. */
export async function unmatchedFixedPriceBooking(database: Pool, scheduledAtSql?: string): Promise<string> {
  const bookingId = await insertQuoteRequest(database, { bookingType: 'fixed_price', scheduledAtSql });
  await database.query(`UPDATE bookings SET subcategory_id = $2, service_price = 40000, service_fee = 10000,
      total_amount = 50000 WHERE id = $1`, [bookingId, fixedService]);
  return bookingId;
}

/** 10:00 AM in Manila, three days from today there. */
export const tenAmInThreeDaysSql =
  "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '3 days 10 hours') AT TIME ZONE 'Asia/Manila'";

/**
 * A booking the gateway can really be asked to pay with its provider already
 * on it: a fixed-price booking (10:00 AM Manila, three days out) that the
 * real offer flow offered to provider A (kickOfferCycle, as auto-dispatch
 * does at booking creation) and provider A accepted through the mounted
 * route, which leaves it 'matched' with provider A. POST /payments/intent
 * takes card or GCash for a matched booking (canTransition matched ->
 * payment_pending). An accepted quote at payment_pending can only be paid
 * from the wallet: that route refuses it for any other method, with or
 * without the E14 hold.
 *
 * The gateway intent is then written as that route's card/GCash branch
 * writes it (an awaiting_payment intent for the booking total, the booking at
 * payment_pending with the method), not by calling the route, and
 * bookings.payment_intent_id is left empty: the fixture keeps that column as
 * a uuid foreign key, where production stores PayMongo's own intent id in a
 * VARCHAR(255) (migration 004). The webhook never reads that column.
 */
export async function matchedBookingAwaitingGatewayPayment(database: Pool): Promise<string> {
  await enableOfferDispatch(database);
  const bookingId = await unmatchedFixedPriceBooking(database, tenAmInThreeDaysSql);
  // Auto-dispatch at booking creation: the real matcher offers it to provider A.
  const offer = await kickOfferCycle(bookingId);
  if (offer?.provider_id !== providerA) throw new Error(`Fixture offer went to ${offer?.provider_id ?? 'no one'}`);
  const accepted = await acceptOfferAs(providerUserA, offer.id);
  if (accepted.status !== 200) throw new Error(`Fixture offer accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  const booking = (await database.query<{ status: string; provider_id: string | null }>(
    'SELECT status, provider_id FROM bookings WHERE id = $1', [bookingId])).rows[0]!;
  if (booking.status !== 'matched' || booking.provider_id !== providerA
    || !canTransition('matched', 'payment_pending')) {
    throw new Error(`Fixture booking is not gateway-payable with its provider: ${JSON.stringify(booking)}`);
  }
  await database.query(`INSERT INTO payment_intents (booking_id, paymongo_intent_id, amount, payment_method, status)
    VALUES ($1, 'pi_synthetic_r_not_01', 50000, 'gcash', 'awaiting_payment')`, [bookingId]);
  await database.query(`UPDATE bookings SET status = 'payment_pending', payment_method = 'gcash', updated_at = NOW()
    WHERE id = $1`, [bookingId]);
  return bookingId;
}

/** Customer A accepted provider A's 80,000 quote; returns the booking id. */
export async function acceptedQuoteBooking(database: Pool): Promise<string> {
  const bookingId = await insertQuoteRequest(database);
  const quote = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody());
  if (quote.status !== 201) throw new Error(`Fixture quote failed: ${quote.status} ${JSON.stringify(quote.body)}`);
  const accepted = await flowHttp(customerA, 'customer').accept(bookingId, quote.body.data.id);
  if (accepted.status !== 200) throw new Error(`Fixture accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  return bookingId;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri, Oct 16" for a YYYY-MM-DD calendar date, worked out without Intl. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Every stored customer_paid notice, whoever it went to. */
export async function customerPaidNotices(database: Pool): Promise<Array<{
  user_id: string; title: string; body: string; booking_id: string | null;
}>> {
  return (await database.query(`SELECT user_id, title, body, data->>'bookingId' AS booking_id
    FROM notifications WHERE type = 'customer_paid' ORDER BY created_at, id`)).rows;
}

/**
 * Make the database refuse to COMMIT any transaction that marks a booking
 * paid: a deferred constraint trigger raises at commit time, so every write
 * of the payment transaction (debit, payment record, booking status,
 * financial terms, escrow hold) rolls back together, after all of them ran.
 * A notice sent from anywhere inside that transaction would already be
 * stored by then (notices are saved on their own connection), so a test on
 * this failure proves the notice waits for the commit.
 */
export async function failPaidBookingAtCommit(database: Pool): Promise<void> {
  await database.query(`
    CREATE FUNCTION refuse_paid_booking_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'synthetic commit failure';
    END $$;
    CREATE CONSTRAINT TRIGGER refuse_paid_booking_commit AFTER UPDATE ON bookings
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW WHEN (NEW.status = 'paid') EXECUTE FUNCTION refuse_paid_booking_commit();
  `);
}

/** The rows a payment writes, for a before/after comparison. */
export async function paymentState(database: Pool, bookingId: string): Promise<Record<string, unknown[]>> {
  return {
    booking: (await database.query(`SELECT status, escrow_status, payment_method, payment_intent_id
      FROM bookings WHERE id = $1`, [bookingId])).rows,
    intents: (await database.query(`SELECT id, status, paymongo_payment_id FROM payment_intents
      WHERE booking_id = $1 ORDER BY id`, [bookingId])).rows,
    walletTransactions: (await database.query(`SELECT wallet_id, amount::text FROM wallet_transactions
      WHERE booking_id = $1 ORDER BY id`, [bookingId])).rows,
    financialTerms: (await database.query(`SELECT version, fixed_by_event FROM booking_financial_terms
      WHERE booking_id = $1 ORDER BY version`, [bookingId])).rows,
    wallets: (await database.query(`SELECT id, available_balance::text, pending_balance::text
      FROM wallets ORDER BY id`)).rows,
  };
}

/**
 * Make the inbox refuse to store a customer_paid notice, as a real database
 * failure (every other notification type still saves).
 */
export async function failCustomerPaidInbox(database: Pool): Promise<void> {
  await database.query(`
    CREATE FUNCTION refuse_customer_paid() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'synthetic inbox outage';
    END $$;
    CREATE TRIGGER refuse_customer_paid BEFORE INSERT ON notifications
      FOR EACH ROW WHEN (NEW.type = 'customer_paid') EXECUTE FUNCTION refuse_customer_paid();
  `);
}
