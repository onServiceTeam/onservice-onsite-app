// S1-9 (OPS-559) helpers: the customer's real payment route on the guarded
// participant fixture, plus a booking whose custom quote the customer has
// accepted. acceptQuote leaves such a booking at payment_pending, with the
// quoting provider assigned and the quote's pricing terms recorded, and no
// payment record at all. The fixture writes that state directly, mirroring
// acceptQuote as of 736420a8 (services/booking.service.ts:1448-1520): the
// participant fixture has no quote tables, so acceptQuote itself does not run.
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import { db } from '../../src/models/db';
import paymentRouter from '../../src/routes/payment.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { appendPricingTermsInTransaction } from '../../src/services/booking-financial-terms.service';
import {
  withParticipantRefundDatabase, customerA, providerA, syntheticSecret,
} from './booking-participant-postgres';

export const quotedBooking = '30000000-0000-4000-8000-000000000009';

// pricingTerms false models a quote accepted before quote_accepted terms were
// recorded (before 34549ec5), so payment resolves the terms itself.
export async function withQuotePaymentDatabase(
  run: (database: Pool) => Promise<void>,
  options: { pricingTerms?: boolean } = {},
): Promise<void> {
  await withParticipantRefundDatabase(async database => {
    // The production payment_intents shape the wallet payment writes: every
    // status from migration 012, the top-up and client-key columns, and the
    // booking-or-top-up rule from migration 122.
    await database.query(`
      ALTER TABLE payment_intents ADD COLUMN topup_id text, ADD COLUMN client_key varchar(255);
      ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_status_check;
      ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_status_check CHECK (status IN
        ('pending', 'awaiting_payment', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded'));
      ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_kind_xor CHECK (
        (booking_id IS NOT NULL AND topup_id IS NULL) OR (booking_id IS NULL AND topup_id IS NOT NULL));
    `);
    // Customer A accepted provider A's 80,000 quote: the 25% fee makes
    // 100,000, and customer A's wallet holds 150,000. The job request's
    // scheduled time (a placeholder set from its urgency) is two days out.
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method,status,escrow_status,
        provider_id,service_price,service_fee,total_amount,scheduled_at)
      VALUES ($1,$2,NULL,'payment_pending','pending',$3,80000,20000,100000,NOW() + INTERVAL '2 days')`,
    [quotedBooking, customerA, providerA]);
    if (options.pricingTerms !== false) {
      await db.transaction(client => appendPricingTermsInTransaction(client, {
        bookingId: quotedBooking, event: 'quote_accepted', sourceEventId: crypto.randomUUID(),
        createdBy: customerA, metadata: { quotedPriceCentavos: 80000, sukiDiscountCentavos: 0 },
      }));
    }
    await run(database);
  });
}

export function walletPayHttp(userId: string, role = 'customer') {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/payments', paymentRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  return (bookingId: string) => request(app)
    .post('/api/v1/payments/intent')
    .set('Authorization', `Bearer ${token}`)
    .send({ bookingId, paymentMethod: 'wallet' });
}
