// Slice 2 (S2-0): money and dispute fixture on top of the guarded dispute
// fixture. It adds:
//   - a bystander booking from a third customer, holding far more than any
//     booking under test, so each payout limit is tested against a shared
//     escrow wallet that always has enough money in it;
//   - one admin_actions verb list covering every route these tests drive;
//   - HTTP helpers for the support refund, dispute filing and admin dispute
//     decision routes, and the S1-8 admin cancel and manual release helpers;
//   - builders for the booking states the Slice 2 tests start from.
// Do not stack allowAdminCancelAudits or allowAdminReleaseAndCancel on this
// fixture: the first narrows the verb list and the second re-adds a column
// the dispute fixture already has.
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import { db } from '../../src/models/db';
import disputeRouter from '../../src/routes/dispute.routes';
import disputeAdminRouter from '../../src/routes/dispute-admin.routes';
import bookingRouter from '../../src/routes/booking.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { canTransition, type BookingStatus } from '../../src/types/booking.types';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../../src/services/wallet.service';
import { appendAuthorizationTermsInTransaction } from '../../src/services/booking-financial-terms.service';
import { withDisputeDatabase } from './dispute-postgres';
import { adminCancelHttp, adminReleaseHttp } from './booking-admin-cancel-postgres';
import {
  bookingB, customerB, escrowWallet, operatorId, otherTicketId, providerUserB, refundHttp, participantHttp, syntheticSecret,
} from './booking-participant-postgres';

export { adminCancelHttp, adminReleaseHttp };

export const customerC = '20000000-0000-4000-8000-000000000003';
export const customerWalletC = '20000000-0000-4000-8000-000000000033';
export const bystanderBooking = '30000000-0000-4000-8000-000000000003';
export const bystanderHeld = 5000000;

export async function withMoneyDisputeDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withDisputeDatabase(async database => {
    // The customer confirm counts the provider's completed jobs (production
    // column providers.total_jobs, migrations 002 and 013).
    await database.query(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
      ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
        CHECK (action_type IN ('refund_issued','dispute_resolved','booking_cancelled','manual_escrow_release'));
      ALTER TABLE providers ADD COLUMN total_jobs integer NOT NULL DEFAULT 0`);
    // The bystander is a real paid wallet booking: funded through the same
    // wallet helpers, with a payment record and authorization terms.
    await database.query('INSERT INTO users(id) VALUES ($1)', [customerC]);
    await database.query('INSERT INTO notification_preferences(user_id) VALUES ($1)', [customerC]);
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method,service_price,service_fee,total_amount)
      VALUES ($1,$2,'wallet',4000000,1000000,$3)`, [bystanderBooking, customerC, bystanderHeld]);
    await database.query(`INSERT INTO wallets(id,user_id,type,available_balance)
      VALUES ($1,$2,'customer',$3)`, [customerWalletC, customerC, bystanderHeld]);
    await db.transaction(async client => {
      await client.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bystanderBooking]);
      await debitWalletInTransaction(client, customerWalletC, bystanderHeld, 'payment', 'Synthetic booking funding', bystanderBooking);
      await holdEscrowInTransaction(client, escrowWallet, bystanderHeld, bystanderBooking);
    });
    await database.query(`INSERT INTO payment_intents(booking_id,amount,payment_method,status)
      VALUES ($1,$2,'wallet','succeeded')`, [bystanderBooking, bystanderHeld]);
    await database.query(`UPDATE bookings SET payment_intent_id=(SELECT id FROM payment_intents WHERE booking_id=$1)
      WHERE id=$1`, [bystanderBooking]);
    await db.transaction(client => appendAuthorizationTermsInTransaction(client, {
      bookingId: bystanderBooking, event: 'wallet_payment_authorized', sourceEventId: bystanderBooking,
    }));
    await run(database);
  });
}

// What one booking still holds on the shared escrow wallet, as a number.
export async function heldFor(database: Pool, bookingId: string): Promise<number> {
  return Number((await database.query<{ held: string }>(`SELECT COALESCE(SUM(amount),0)::text AS held
    FROM wallet_transactions WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, bookingId])).rows[0]!.held);
}

async function stateOfB(database: Pool): Promise<{ status: string; escrow_status: string } | undefined> {
  return (await database.query<{ status: string; escrow_status: string }>(
    'SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows[0];
}

// The super admin's real support refund of booking B, through its linked case.
export function supportRefundB(amount: number, idempotencyKey: string) {
  return refundHttp().post({
    amount, reason: 'Synthetic support-approved partial refund',
    supportTicketId: otherTicketId, idempotencyKey,
  }, bookingB);
}

function signed(userId: string, role: string): string {
  return jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
}

export function fileDisputeHttp(customerId = customerB) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/disputes', disputeRouter);
  app.use(errorMiddleware);
  const token = signed(customerId, 'customer');
  return (bookingId: string, type = 'substandard') => request(app)
    .post('/api/v1/disputes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      bookingId, type,
      description: 'Synthetic dispute filed by the customer for this test. The work was not done as agreed.',
    });
}

export function adminResolveHttp() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/disputes', disputeAdminRouter);
  app.use(errorMiddleware);
  const token = signed(operatorId, 'super_admin');
  return (disputeId: string, body: Record<string, unknown>) => request(app)
    .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
    .set('Authorization', `Bearer ${token}`)
    .send({ decisionNotes: 'Synthetic admin decision recorded for this test.', ...body });
}

// The provider's real customer no-show report (S2-1), as provider B.
export function reportNoShowHttp(providerUserId = providerUserB) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/bookings', bookingRouter);
  app.use(errorMiddleware);
  const token = signed(providerUserId, 'provider');
  return (bookingId: string) => request(app)
    .post(`/api/v1/bookings/${bookingId}/report-no-show`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
}

// Booking B confirmed and released, still inside the dispute window, with no
// earlier refund. The customer confirm and the super admin's manual release
// run through the real routes. The confirm-time release is refused because
// the provider is marked as suspended during the job; that marker is set and
// cleared here with direct SQL, because no production code clears it today
// (LAUNCH-LIMITATIONS 118). Side effects a later "before" snapshot must come
// after: providers.total_jobs + 1, confirmed_at, one manual_escrow_release
// audit, and the provider, revenue and guarantee credits.
export async function confirmedButReleasedB(database: Pool): Promise<void> {
  await database.query('UPDATE bookings SET provider_suspended_during_booking_at=NOW() WHERE id=$1', [bookingB]);
  const confirm = await participantHttp(customerB, 'customer')(bookingB, 'confirmed');
  const afterConfirm = await stateOfB(database);
  if (confirm.status !== 409 || !/provider was suspended during this booking/.test(confirm.body?.error?.message ?? '')
      || afterConfirm?.status !== 'confirmed' || afterConfirm.escrow_status !== 'held') {
    throw new Error(`Expected a committed confirm with a refused release; got ${confirm.status} and ${JSON.stringify(afterConfirm)}.`);
  }
  await database.query('UPDATE bookings SET provider_suspended_during_booking_at=NULL WHERE id=$1', [bookingB]);
  const release = await adminReleaseHttp()(bookingB);
  const afterRelease = await stateOfB(database);
  if (release.status !== 200 || afterRelease?.status !== 'confirmed' || afterRelease.escrow_status !== 'released'
      || await heldFor(database, bookingB) !== 0) {
    throw new Error(`Manual release did not leave B confirmed and released; got ${release.status} and ${JSON.stringify(afterRelease)}.`);
  }
}

// Booking B resolved and labelled "held" while it holds only 750,000 of its
// 1,000,000: a real support refund of 250,000, then one UPDATE that sets the
// status and label older code could leave behind (a dispute filed after the
// refund relabelled it "held", and a decision then set "resolved"). No dispute
// row is created. Live data may already be in this state, so the guards are
// tested against it directly. The admin cancel accepts "resolved".
export async function shortHeldResolvedB(database: Pool, idempotencyKey: string): Promise<void> {
  const refund = await supportRefundB(250000, idempotencyKey);
  if (refund.status !== 200) throw new Error(`Support refund failed with ${refund.status}.`);
  await database.query("UPDATE bookings SET status='resolved', escrow_status='held' WHERE id=$1", [bookingB]);
  const state = await stateOfB(database);
  if (state?.status !== 'resolved' || state.escrow_status !== 'held' || await heldFor(database, bookingB) !== 750000
      || !canTransition(state.status as BookingStatus, 'cancelled_by_admin')) {
    throw new Error(`Expected B resolved, labelled held, holding 750000; got ${JSON.stringify(state)}.`);
  }
}

// The default 30-minute no-show window (the fixture has no setting for it):
// B was marked complete ten minutes after its scheduled start, so a no-show
// dispute filed now qualifies for automatic resolution (as FIN-016 does).
export async function noShowTimingB(database: Pool): Promise<void> {
  await database.query(`UPDATE bookings SET scheduled_at=NOW() - INTERVAL '30 minutes',
      completed_at=NOW() - INTERVAL '20 minutes' WHERE id=$1`, [bookingB]);
}
