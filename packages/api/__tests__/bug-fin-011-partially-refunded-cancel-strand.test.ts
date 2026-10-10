import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import { db } from '../src/models/db';
import bookingAdminRouter from '../src/routes/booking-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot, refundHttp,
  refundBody, secondKey, customerA, customerB, customerWalletA, escrowWallet, operatorId, providerB, providerUserB,
  bookingA, bookingB, syntheticSecret,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function bookingEscrowLeft(database: Pool, bookingId: string) {
  return (await database.query<{ remaining: string }>(`SELECT COALESCE(SUM(amount),0)::text AS remaining
    FROM wallet_transactions WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, bookingId])).rows[0]!.remaining;
}

// The super admin's real manual release route. The shared fixture lacks the
// suspension marker column it reads and allows only refund audits, so both
// are added here, as the production schema has them.
async function releaseAsSuperAdmin(database: Pool, bookingId: string) {
  await database.query(`ALTER TABLE bookings ADD COLUMN provider_suspended_during_booking_at timestamptz;
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
      CHECK (action_type IN ('refund_issued','manual_escrow_release'))`);
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/bookings', bookingAdminRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: operatorId, role: 'super_admin', sessionVersion: 1, type: 'access' },
    syntheticSecret, { expiresIn: '5m' });
  return request(app).post(`/api/v1/admin/bookings/${bookingId}/escrow/release`)
    .set('Authorization', `Bearer ${token}`).send({ reason: 'Synthetic support-approved manual release' });
}

it('Bug FIN-011 - a booking whose escrow was already partly refunded or released cannot be cancelled as if its money were still held', async () => {
  await withParticipantRefundDatabase(async database => {
    // A support-approved partial refund through the real super-admin route:
    // 25,000 of booking A's 100,000 goes back to the customer's wallet.
    const partial = await refundHttp().post();
    expect(partial.status).toBe(200);
    expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingA])).rows)
      .toEqual([{ status: 'paid', escrow_status: 'partially_refunded' }]);
    expect(await bookingEscrowLeft(database, bookingA)).toBe('75000');

    // A manual release to the provider through the real super-admin route.
    // The booking stays 'paid' while its whole escrow has gone to the
    // provider and the platform.
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const released = await releaseAsSuperAdmin(database, bookingB);
    expect(released.status).toBe(200);
    expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'paid', escrow_status: 'released' }]);
    expect(await bookingEscrowLeft(database, bookingB)).toBe('0');
    const before = await participantSnapshot(database);

    // Before FIN-011 both answered 200. Booking A became cancelled with
    // 75,000 still in its escrow and no step left that would ever move it.
    // Booking B became cancelled with no refund, after its money had already
    // been paid out.
    const partialCancel = await participantHttp(customerA, 'customer')(bookingA, 'cancelled_by_customer');
    expect(partialCancel.status).toBe(409);
    expect(partialCancel.body.error).toMatchObject({
      code: 'BOOKING_CANCEL_PARTIALLY_REFUNDED',
      message: 'This booking already had a partial refund. Please contact support to finish cancelling it.',
    });
    const releasedCancel = await participantHttp(customerB, 'customer')(bookingB, 'cancelled_by_customer');
    expect(releasedCancel.status).toBe(409);
    expect(releasedCancel.body.error).toMatchObject({
      code: 'BOOKING_CANCEL_ESCROW_RELEASED',
      message: 'Payment for this booking was already released. Please contact support.',
    });
    // The assigned provider's cancel reaches the same refusal (D35 Q4 and
    // Q11 ask for provider wording too).
    const providerCancel = await participantHttp(providerUserB, 'provider')(bookingB, 'cancelled_by_provider');
    expect(providerCancel.status).toBe(409);
    expect(providerCancel.body.error.code).toBe('BOOKING_CANCEL_ESCROW_RELEASED');
    expect(await participantSnapshot(database)).toEqual(before);

    // Once support refunds the rest of booking A, escrow is 'refunded' with
    // nothing left, and the customer's cancellation goes through without
    // moving money.
    const rest = await refundHttp().post({ ...refundBody, amount: 75000, idempotencyKey: secondKey });
    expect(rest.status).toBe(200);
    expect(await bookingEscrowLeft(database, bookingA)).toBe('0');
    const refunded = await participantSnapshot(database);
    const cancelled = await participantHttp(customerA, 'customer')(bookingA, 'cancelled_by_customer');
    expect(cancelled.status).toBe(200);
    expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingA])).rows)
      .toEqual([{ status: 'cancelled_by_customer', escrow_status: 'refunded' }]);
    const after = await participantSnapshot(database);
    expect({ wallets: after.wallets, ledger: after.ledger, intents: after.intents, retry: after.retry })
      .toEqual({ wallets: refunded.wallets, ledger: refunded.ledger, intents: refunded.intents, retry: refunded.retry });
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletA])).rows)
      .toEqual([{ available_balance: '250000' }]);
  });
}, 30000);
