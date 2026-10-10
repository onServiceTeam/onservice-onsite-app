import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bookingAdminRouter from '../src/routes/booking-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  operatorId, bookingA, bookingB, customerWalletA, syntheticSecret,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Targets a super admin may not request through the general status route.
// Each has a dedicated, audited admin action (cancel, force complete,
// release, refund) or a dedicated participant flow (payment, dispute,
// quote, offer). Held for D35 Q1 and unchanged here: the on-site steps,
// completed_by_provider, payout_ready, paid_out and resolved.
const FLOW_ONLY_TARGETS = [
  'cancelled_by_admin', 'cancelled_by_customer', 'cancelled_by_provider',
  'confirmed', 'paid', 'disputed',
  'requested', 'quoted', 'matched', 'payment_pending',
] as const;

it('Bug SEC-091 - a super admin cannot bypass the audited admin money actions through the status route', async () => {
  await withParticipantRefundDatabase(async database => {
    const before = await participantSnapshot(database);
    const patch = participantHttp(operatorId, 'super_admin');

    // Before SEC-091: 200, a full refund, no reason and no admin_actions row.
    const cancelled = await patch(bookingA, 'cancelled_by_admin');
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error).toMatchObject({
      code: 'BOOKING_TRANSITION_FLOW_ONLY',
      message: 'Use the admin booking actions (cancel, force complete, release or refund) or the booking\'s own flow for this change.',
    });
    expect(await participantSnapshot(database)).toEqual(before);

    // Before SEC-091: 200 and escrow marked held for an unfunded booking.
    await database.query("UPDATE bookings SET status='payment_pending', escrow_status='pending' WHERE id=$1", [bookingB]);
    const pending = await participantSnapshot(database);
    const faked = await patch(bookingB, 'paid');
    expect(faked.status).toBe(409);
    expect(faked.body.error.code).toBe('BOOKING_TRANSITION_FLOW_ONLY');
    expect(await participantSnapshot(database)).toEqual(pending);

    for (const target of FLOW_ONLY_TARGETS) {
      const response = await patch(bookingA, target);
      expect({ target, status: response.status, code: response.body.error?.code })
        .toEqual({ target, status: 409, code: 'BOOKING_TRANSITION_FLOW_ONLY' });
    }
    expect(await participantSnapshot(database)).toEqual(pending);
  });
}, 60000);

it('the super admin cancel action still cancels with a reason, the refund and an audit row', async () => {
  await withParticipantRefundDatabase(async database => {
    // The shared fixture only allows refund audits; the admin cancel writes
    // booking_cancelled, as the production admin_actions check allows.
    await database.query(`ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
      ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
        CHECK (action_type IN ('refund_issued','booking_cancelled'))`);
    const app = express();
    app.use(express.json(), cookieParser());
    app.use('/api/v1/admin/bookings', bookingAdminRouter);
    app.use(errorMiddleware);
    const token = jwt.sign({ userId: operatorId, role: 'super_admin', sessionVersion: 1, type: 'access' },
      syntheticSecret, { expiresIn: '5m' });

    const response = await request(app).post(`/api/v1/admin/bookings/${bookingA}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Synthetic support-approved admin cancellation' });

    expect(response.status).toBe(200);
    expect((await database.query('SELECT status,escrow_status,cancellation_reason FROM bookings WHERE id=$1', [bookingA])).rows)
      .toEqual([{ status: 'cancelled_by_admin', escrow_status: 'refunded', cancellation_reason: 'Synthetic support-approved admin cancellation' }]);
    // Unassigned booking: full refund including the fee back to the wallet.
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletA])).rows)
      .toEqual([{ available_balance: '250000' }]);
    expect((await database.query("SELECT action_type,target_id,reason FROM admin_actions WHERE action_type='booking_cancelled'")).rows)
      .toEqual([{ action_type: 'booking_cancelled', target_id: bookingA, reason: 'Synthetic support-approved admin cancellation' }]);
  });
}, 30000);

it('the admin status targets held for D35 Q1 behave exactly as before', async () => {
  await withParticipantRefundDatabase(async database => {
    // Super admin tidies a booking whose escrow was already released by the
    // manual release action, which does not advance the booking status.
    await database.query("UPDATE bookings SET status='confirmed', escrow_status='released' WHERE id=$1", [bookingB]);
    // An on-site step for a provider.
    await database.query("UPDATE bookings SET status='provider_arrived' WHERE id=$1", [bookingA]);
    const before = await participantSnapshot(database);

    const superAdmin = participantHttp(operatorId, 'super_admin');
    expect((await superAdmin(bookingB, 'payout_ready')).status).toBe(200);
    expect((await superAdmin(bookingB, 'paid_out')).status).toBe(200);
    expect((await superAdmin(bookingA, 'in_progress')).status).toBe(200);

    // completed_by_provider is held for the super admin: it reaches the
    // ordinary on-site time check, not the FLOW_ONLY refusal.
    await database.query("UPDATE bookings SET work_started_at=NOW() - INTERVAL '1 minute' WHERE id=$1", [bookingA]);
    const early = await superAdmin(bookingA, 'completed_by_provider');
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBeUndefined();
    expect(early.body.error.message).toMatch(/^You must be on-site for at least 15 minutes/);

    // resolved is held for the super admin: today it is the only way out for
    // a booking marked disputed without a dispute record.
    await database.query("UPDATE bookings SET status='disputed' WHERE id=$1", [bookingA]);
    expect((await superAdmin(bookingA, 'resolved')).status).toBe(200);

    // A plain admin keeps the on-site steps.
    await database.query("UPDATE users SET role='admin' WHERE id=$1", [operatorId]);
    await database.query("UPDATE bookings SET status='provider_arrived' WHERE id=$1", [bookingA]);
    expect((await participantHttp(operatorId, 'admin')(bookingA, 'in_progress')).status).toBe(200);

    expect((await database.query('SELECT id,status FROM bookings ORDER BY id')).rows).toEqual([
      { id: bookingA, status: 'in_progress' }, { id: bookingB, status: 'paid_out' },
    ]);
    // No money moved: these targets have no money step on the status route.
    const after = await participantSnapshot(database);
    expect({ wallets: after.wallets, ledger: after.ledger, intents: after.intents })
      .toEqual({ wallets: before.wallets, ledger: before.ledger, intents: before.intents });
  });
}, 30000);
