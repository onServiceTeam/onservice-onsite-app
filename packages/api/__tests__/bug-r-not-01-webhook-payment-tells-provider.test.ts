// R-NOT-01 (repair list 2026-10-14, P1), gateway half: when a PayMongo
// payment.paid webhook pays a booking that already has its provider, that
// provider gets the same "customer paid" notice as on the wallet route.
// External payments are on hold (E14), so this path is dormant today; it is
// kept consistent so the behaviour is right when they return.
//
// The booking is one a card or GCash payment can really reach with its
// provider already on it: a fixed-price booking whose dispatch offer the
// provider accepted (status 'matched'). An accepted D38 quote is not used
// here: POST /payments/intent refuses any method but the wallet for a
// booking already at payment_pending (canTransition payment_pending ->
// payment_pending is false), with or without the E14 hold, so accepted
// quotes never reach this webhook.
//
// Real HTTP into the mounted webhook router with a real PayMongo-style
// signature, the real migration 133 webhook_events table, and real booking,
// escrow and notification rows on the guarded PostgreSQL request-flow fixture.
// The offer acceptance runs through the mounted booking route; the gateway
// intent is written as the intent route's card/GCash branch writes it (see
// matchedBookingAwaitingGatewayPayment for why the route itself is not run).
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { withRequestFlowDatabase, platformDate, providerUserA } from './helpers/request-flow-postgres';
import { readMigration } from './helpers/request-engine-postgres';
import {
  customerPaidNotices, dayLabel, failCustomerPaidInbox, failPaidBookingAtCommit,
  matchedBookingAwaitingGatewayPayment, paymentState,
} from './helpers/customer-paid-notice-postgres';
import webhookRouter from '../src/routes/webhook.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { logger } from '../src/utils/logger';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const webhookSecret = 'whsec_synthetic_r_not_01';
const paymongoPaymentId = 'pay_synthetic_r_not_01';

beforeAll(() => { process.env.PAYMONGO_WEBHOOK_SECRET = webhookSecret; });
afterAll(() => { delete process.env.PAYMONGO_WEBHOOK_SECRET; });

/** A matched booking with provider A and a GCash intent awaiting payment (50,000). */
async function bookingAwaitingGatewayPayment(database: Pool): Promise<string> {
  await database.query(readMigration('133_webhook_event_idempotency.sql'));
  return matchedBookingAwaitingGatewayPayment(database);
}

function paidWebhook(bookingId: string, eventId: string) {
  const body = {
    data: {
      id: eventId,
      attributes: {
        type: 'payment.paid',
        data: {
          id: paymongoPaymentId,
          attributes: { amount: 50000, metadata: { booking_id: bookingId, intent_kind: 'booking' } },
        },
      },
    },
  };
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRouter);
  app.use(errorMiddleware);
  return request(app).post('/api/v1/webhooks/paymongo')
    .set('paymongo-signature', `t=${timestamp},te=${signature}`).send(body);
}

// The fixed-price booking is Aircon cleaning at 10:00 AM Manila, three days out.
const expectedBody = () =>
  `Ana paid for Aircon cleaning. The job is confirmed for ${dayLabel(platformDate(3))} at 10:00 AM.`;

it('Bug R-NOT-01-F — after a gateway payment.paid webhook the assigned provider gets exactly one customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await bookingAwaitingGatewayPayment(database);

    const delivered = await paidWebhook(bookingId, 'evt_synthetic_r_not_01_a');

    expect(delivered.status).toBe(200);
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'paid', escrow_status: 'held' }]);
    expect(await customerPaidNotices(database)).toEqual([{
      user_id: providerUserA, title: 'Customer paid', body: expectedBody(), booking_id: bookingId,
    }]);
  });
}, 90000);

it('Bug R-NOT-01-G — a customer-paid notice that fails to save does not fail the payment.paid webhook', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await bookingAwaitingGatewayPayment(database);
    await failCustomerPaidInbox(database);
    (logger.error as jest.Mock).mockClear();

    const delivered = await paidWebhook(bookingId, 'evt_synthetic_r_not_01_b');

    expect(delivered.status).toBe(200);
    // The payment and the event are recorded as done, so PayMongo does not retry.
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'paid', escrow_status: 'held' }]);
    expect((await database.query('SELECT status FROM payment_intents WHERE booking_id = $1', [bookingId])).rows)
      .toEqual([{ status: 'succeeded' }]);
    expect((await database.query(`SELECT status FROM webhook_events WHERE event_id = 'evt_synthetic_r_not_01_b'`)).rows)
      .toEqual([{ status: 'done' }]);
    expect(await customerPaidNotices(database)).toEqual([]);
    expect((logger.error as jest.Mock).mock.calls.filter(([message]) =>
      message === 'Webhook payment.paid customer-paid notice to the provider failed'))
      .toEqual([[
        'Webhook payment.paid customer-paid notice to the provider failed',
        expect.objectContaining({ bookingId, error: expect.stringContaining('synthetic inbox outage') }),
      ]]);
  });
}, 90000);

it('a second payment.paid event for an already paid booking sends no second customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await bookingAwaitingGatewayPayment(database);
    expect((await paidWebhook(bookingId, 'evt_synthetic_r_not_01_c')).status).toBe(200);

    // A different event id for the same payment gets past the event-id gate.
    const again = await paidWebhook(bookingId, 'evt_synthetic_r_not_01_d');

    expect(again.status).toBe(200);
    expect((await customerPaidNotices(database)).map(n => n.user_id)).toEqual([providerUserA]);
  });
}, 90000);

it('a payment.paid webhook whose payment fails at commit, after every payment write, sends no customer-paid notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await bookingAwaitingGatewayPayment(database);
    await failPaidBookingAtCommit(database);
    const before = await paymentState(database, bookingId);
    (logger.error as jest.Mock).mockClear();

    const delivered = await paidWebhook(bookingId, 'evt_synthetic_r_not_01_e');

    expect(delivered.status).toBe(500);
    // It failed at the commit, not earlier.
    expect((logger.error as jest.Mock).mock.calls.filter(([message]) =>
      message === 'Webhook payment.paid trx failed (booking + escrow rolled back)')
      .map(([, context]) => (context as { error: string }).error)).toEqual(['synthetic commit failure']);
    // The booking status, escrow hold and intent update all rolled back, and
    // the event claim was released so PayMongo's retry runs it again.
    expect(await paymentState(database, bookingId)).toEqual(before);
    expect(before.booking).toEqual([{
      status: 'payment_pending', escrow_status: expect.any(String), payment_method: 'gcash', payment_intent_id: null,
    }]);
    expect((await database.query(`SELECT status FROM webhook_events WHERE event_id = 'evt_synthetic_r_not_01_e'`)).rows)
      .toEqual([]);
    expect(await customerPaidNotices(database)).toEqual([]);
  });
}, 90000);
