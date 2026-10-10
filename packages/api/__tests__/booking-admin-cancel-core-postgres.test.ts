import { db } from '../src/models/db';
import * as socketService from '../src/services/socket.service';
import * as slotWaitlistService from '../src/services/slot-waitlist.service';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  allowAdminCancelAudits, adminCancelHttp, allowAdminReleaseAndCancel, adminReleaseHttp,
} from './helpers/booking-admin-cancel-postgres';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantSnapshot, refundHttp,
  customerWalletA, escrowWallet, providerA, providerB, bookingA, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S1-8 supporting checks (FIN-012 and OPS-558 are the bug tests): the
// super admin's dedicated cancel now runs on the shared cancellation core.

async function assignB() {
  await db.transaction(async client => {
    await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
    await appendProviderAssignmentTermsInTransaction(client, {
      bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
    });
  });
}

it('an admin cancel of a partially refunded booking is refused with admin wording and changes nothing', async () => {
  await withParticipantRefundDatabase(async database => {
    await allowAdminCancelAudits(database);
    // A support partial refund of 25,000 on booking A, through the real route.
    expect((await refundHttp().post()).status).toBe(200);
    const before = await participantSnapshot(database);

    // Before S1-8 this cancelled the booking and left 75,000 in its escrow.
    const response = await adminCancelHttp()(bookingA);
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'BOOKING_CANCEL_PARTIALLY_REFUNDED',
      message: 'Escrow shows a partial refund. For a resolved dispute, use Release instead of cancelling. Otherwise use Refund for the rest, then cancel.',
    });
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 60000);

it('an admin cancel of a booking whose escrow was already released behaves as before (D35 Q11 decision 1 open)', async () => {
  await withParticipantRefundDatabase(async database => {
    await allowAdminReleaseAndCancel(database);
    await assignB();
    expect((await adminReleaseHttp()(bookingB)).status).toBe(200);
    const before = await participantSnapshot(database);

    const response = await adminCancelHttp()(bookingB);
    expect(response.status).toBe(200);
    expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'cancelled_by_admin', escrow_status: 'released' }]);
    // No money moves: the provider was already paid by the release.
    const after = await participantSnapshot(database);
    expect({ wallets: after.wallets, ledger: after.ledger, intents: after.intents, retry: after.retry })
      .toEqual({ wallets: before.wallets, ledger: before.ledger, intents: before.intents, retry: before.retry });
    expect((await database.query(`SELECT details->>'refundAmount' AS refund FROM admin_actions
        WHERE action_type='booking_cancelled'`)).rows).toEqual([{ refund: '0' }]);
  });
}, 60000);

it('an admin cancel whose audit row fails rolls back the refund, the status and the offers', async () => {
  await withParticipantRefundDatabase(async database => {
    // The fixture's audit check allows only refund audits, so the
    // booking_cancelled insert fails after the refund and the status were
    // written on the same transaction.
    await database.query(`INSERT INTO booking_offers(booking_id,provider_id,status,expires_at,attempt_number)
      VALUES ($1,$2,'pending',NOW() + INTERVAL '45 seconds',1)`, [bookingA, providerA]);
    const before = await participantSnapshot(database);
    const emit = jest.spyOn(socketService, 'emitAdminEvent');
    const kick = jest.spyOn(slotWaitlistService, 'processSlotAvailability').mockResolvedValue(undefined as never);
    try {
      const response = await adminCancelHttp()(bookingA);
      expect(response.status).toBe(500);
      expect(await participantSnapshot(database)).toEqual(before);
      // A cancellation that rolled back is never announced.
      expect(emit).not.toHaveBeenCalled();
      expect(kick).not.toHaveBeenCalled();
    } finally {
      emit.mockRestore();
      kick.mockRestore();
    }
  });
}, 60000);

it('an admin cancel refunds, closes offers and records the audit in one step, then announces after commit', async () => {
  await withParticipantRefundDatabase(async database => {
    await allowAdminCancelAudits(database);
    await database.query(`INSERT INTO booking_offers(booking_id,provider_id,status,expires_at,attempt_number)
      VALUES ($1,$2,'pending',NOW() + INTERVAL '45 seconds',1)`, [bookingA, providerA]);
    const emit = jest.spyOn(socketService, 'emitAdminEvent');
    const kick = jest.spyOn(slotWaitlistService, 'processSlotAvailability').mockResolvedValue(undefined as never);
    try {
      const response = await adminCancelHttp()(bookingA);
      expect(response.status).toBe(200);
      // Unassigned: the full price and fee return to the wallet.
      expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingA])).rows)
        .toEqual([{ status: 'cancelled_by_admin', escrow_status: 'refunded' }]);
      expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletA])).rows)
        .toEqual([{ available_balance: '250000' }]);
      expect((await database.query(`SELECT COALESCE(SUM(amount),0)::text AS remaining FROM wallet_transactions
          WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, bookingA])).rows).toEqual([{ remaining: '0' }]);
      expect((await database.query("SELECT status FROM booking_offers WHERE booking_id=$1", [bookingA])).rows)
        .toEqual([{ status: 'cancelled' }]);
      // The post-commit payment-record step ran for the whole refund.
      expect((await database.query('SELECT status,refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingA])).rows)
        .toEqual([{ status: 'refunded', refunded_amount: '100000' }]);
      expect((await database.query(`SELECT target_id, details->>'refundAmount' AS refund FROM admin_actions
          WHERE action_type='booking_cancelled'`)).rows).toEqual([{ target_id: bookingA, refund: '80000' }]);
      // Before S1-8 the admin cancel never emitted the admin event or kicked
      // the slot waitlist.
      expect(emit).toHaveBeenCalledWith(socketService.ADMIN_EVENTS.BOOKING_STATUS_CHANGED,
        { id: bookingA, oldStatus: 'paid', newStatus: 'cancelled_by_admin' });
      expect(kick).toHaveBeenCalledTimes(1);
      const manilaDay = (await database.query<{ day: string }>(`SELECT to_char(scheduled_at AT TIME ZONE 'Asia/Manila',
          'YYYY-MM-DD') AS day FROM bookings WHERE id=$1`, [bookingA])).rows[0]!.day;
      expect(kick).toHaveBeenCalledWith(null, 'Cebu City', manilaDay);
    } finally {
      emit.mockRestore();
      kick.mockRestore();
    }
  });
}, 60000);
