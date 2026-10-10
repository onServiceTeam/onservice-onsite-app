import type { Pool } from 'pg';
import { db } from '../src/models/db';
import * as disputeService from '../src/services/dispute.service';
import * as paymentService from '../src/services/payment.service';
import { adminResolveDispute } from '../src/services/dispute-admin.service';
import { refundFromEscrowInTransaction } from '../src/services/escrow.service';
import { holdEscrowInTransaction } from '../src/services/wallet.service';
import { withDisputeDatabase, bookingEscrowLeft, waitForWaiters } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, customerB, customerWalletB, escrowWallet, operatorId,
  providerUserB, bookingA, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// MC-03 supporting checks. The bug tests are FIN-013 to FIN-016 and OPS-561.
// Booking B is a paid wallet booking of 1,000,000 centavos, completed by
// provider B, with a succeeded payment record of the same amount. Every
// dispute refund must take the booking's escrow exactly once, inside the
// transaction that records the decision, and mark the payment record only
// after that commit.

const substandard = { type: 'substandard' as const, description: 'Synthetic dispute: the work was incomplete.' };
const decisionNotes = 'Synthetic admin decision recorded for this test.';
type Failure = { statusCode?: number; code?: string; message?: string };
// A deadlock would surface as PostgreSQL code 40P01 instead of a status.
const outcome = (e: Failure) => e.statusCode ?? e.code ?? 'error';

async function escrowRefunds(database: Pool): Promise<string[]> {
  return (await database.query<{ amount: string }>(`SELECT amount::text FROM wallet_transactions
      WHERE wallet_id=$1 AND booking_id=$2 AND type='refund' ORDER BY created_at, id`, [escrowWallet, bookingB]))
    .rows.map(row => row.amount);
}

async function customerBalance(database: Pool): Promise<string> {
  return (await database.query<{ b: string }>('SELECT available_balance::text AS b FROM wallets WHERE id=$1', [customerWalletB]))
    .rows[0]!.b;
}

async function paymentRecord(database: Pool) {
  return (await database.query('SELECT status, refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingB])).rows;
}

async function retryRows(database: Pool) {
  return (await database.query(`SELECT action_type, dispute_id::text, amount_centavos::text, status
      FROM gateway_retry_queue ORDER BY created_at, id`)).rows;
}

async function disputeAndBooking(database: Pool, disputeId: string) {
  return {
    dispute: (await database.query('SELECT status FROM disputes WHERE id=$1', [disputeId])).rows[0]?.status,
    booking: (await database.query('SELECT status FROM bookings WHERE id=$1', [bookingB])).rows[0]?.status,
  };
}

// Support already refunded 250,000 through the real helper, so the booking
// holds only 750,000 of its 1,000,000.
async function supportRefundFirst(): Promise<void> {
  await db.transaction(client => refundFromEscrowInTransaction(
    client, bookingB, 250000, 'Synthetic support-approved partial refund',
  ));
}

// Another booking's escrow (500,000 more for booking A), so the shared escrow
// pool can cover a full 1,000,000 refund and only booking B's own remaining
// escrow can refuse it.
async function fundAnotherBookingsEscrow(): Promise<void> {
  await db.transaction(client => holdEscrowInTransaction(client, escrowWallet, 500000, bookingA));
}

// Holds booking B's row on a second connection, starts `first` and waits for
// it to block, then starts `second` and waits for both, then releases.
async function raceOnBookingLock(
  database: Pool,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
): Promise<unknown[]> {
  const blocker = await database.connect();
  let blockerOpen = true;
  const running: Array<Promise<unknown>> = [];
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
    const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    running.push(first());
    await waitForWaiters(database, pid, 1);
    running.push(second());
    await waitForWaiters(database, pid, 2);
    await blocker.query('COMMIT');
    blockerOpen = false;
    return await Promise.all(running);
  } finally {
    if (blockerOpen) await blocker.query('ROLLBACK');
    await Promise.allSettled(running);
    blocker.release();
  }
}

const providerAccepts = (disputeId: string) => () => disputeService
  .addProviderResponse(disputeId, providerUserB, 'Synthetic: I accept the claim.', 'accept')
  .then(() => 'accepted', outcome);
const adminDecidesFullRefund = (disputeId: string) => () =>
  adminResolveDispute(disputeId, { resolutionType: 'full_refund', decisionNotes }, operatorId)
    .then(() => 'decided', outcome);

it('a provider accept refunds the full amount once and marks the payment record', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    const resolved = await disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic: I accept the claim.', 'accept');

    expect(resolved).toMatchObject({ status: 'resolved', resolution_type: 'full_refund' });
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'resolved', escrow_status: 'refunded' }]);
    expect(await escrowRefunds(database)).toEqual(['-1000000']);
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('0');
    expect(await customerBalance(database)).toBe('2000000');
    expect(await paymentRecord(database)).toEqual([{ status: 'refunded', refunded_amount: '1000000' }]);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

it('a provider accept whose refund cannot be made is refused and records nothing (FIN-015 on the accept path)', async () => {
  await withDisputeDatabase(async database => {
    await supportRefundFirst();
    await fundAnotherBookingsEscrow();
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    const before = await participantSnapshot(database);

    // Before MC-03 this answered OK: the dispute and booking were recorded as
    // refunded, no money moved, and a whole-refund retry was queued.
    await expect(disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic: I accept the claim.', 'accept'))
      .rejects.toMatchObject({ statusCode: 409, message: 'Refund exceeds this booking\'s remaining escrow (750000 centavos).' });

    expect(await participantSnapshot(database)).toEqual(before);
    expect(await disputeAndBooking(database, dispute.id)).toEqual({ dispute: 'open', booking: 'disputed' });
    expect((await database.query('SELECT provider_response FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ provider_response: null }]);
  });
}, 60000);

it('a customer accepting a partial offer refunds once, marks the payment record, then releases the provider share', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    await disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic partial offer', 'partial_offer', 300000);
    const resolved = await disputeService.acceptPartialOffer(dispute.id, customerB);

    expect(resolved).toMatchObject({ status: 'resolved', resolution_type: 'partial_refund' });
    expect(await escrowRefunds(database)).toEqual(['-300000']);
    expect(await customerBalance(database)).toBe('1300000');
    expect(await paymentRecord(database)).toEqual([{ status: 'partially_refunded', refunded_amount: '300000' }]);
    // The provider's 700,000 was released after the refund committed.
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('0');
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'resolved', escrow_status: 'released' }]);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

it('a partial-offer accept whose refund cannot be made is refused and records nothing (FIN-015 on the accept-offer path)', async () => {
  await withDisputeDatabase(async database => {
    await supportRefundFirst();
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    await disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic partial offer', 'partial_offer', 800000);
    const before = await participantSnapshot(database);

    await expect(disputeService.acceptPartialOffer(dispute.id, customerB))
      .rejects.toMatchObject({ statusCode: 409, message: 'Refund exceeds this booking\'s remaining escrow (750000 centavos).' });

    expect(await participantSnapshot(database)).toEqual(before);
    expect(await disputeAndBooking(database, dispute.id)).toEqual({ dispute: 'open', booking: 'disputed' });
  });
}, 60000);

it('a provider accept racing an admin decision (accept first) ends in one refund and a 409, not a deadlock', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    // If the accept locked the booking before the dispute, each side would
    // hold the lock the other needs.
    expect(await raceOnBookingLock(database, providerAccepts(dispute.id), adminDecidesFullRefund(dispute.id)))
      .toEqual(['accepted', 409]);
    expect(await escrowRefunds(database)).toEqual(['-1000000']);
    expect(await customerBalance(database)).toBe('2000000');
    expect(await paymentRecord(database)).toEqual([{ status: 'refunded', refunded_amount: '1000000' }]);
    expect((await database.query('SELECT resolution_type, resolved_by FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ resolution_type: 'full_refund', resolved_by: null }]);
  });
}, 60000);

it('an admin decision racing a provider accept (decision first) ends in one refund and a 409, not a deadlock', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    // If the admin decision locked the booking before the dispute, each side
    // would hold the lock the other needs.
    expect(await raceOnBookingLock(database, adminDecidesFullRefund(dispute.id), providerAccepts(dispute.id)))
      .toEqual(['decided', 409]);
    expect(await escrowRefunds(database)).toEqual(['-1000000']);
    expect(await customerBalance(database)).toBe('2000000');
    expect(await paymentRecord(database)).toEqual([{ status: 'refunded', refunded_amount: '1000000' }]);
    expect((await database.query('SELECT resolved_by, provider_response FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ resolved_by: operatorId, provider_response: null }]);
  });
}, 60000);

it('a customer accepting a partial offer racing an admin decision ends in one refund and a 409, not a deadlock', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    await disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic partial offer', 'partial_offer', 300000);
    // If the accept-offer path locked the booking before the dispute, each
    // side would hold the lock the other needs.
    const customerAccepts = () => disputeService.acceptPartialOffer(dispute.id, customerB).then(() => 'accepted', outcome);
    expect(await raceOnBookingLock(database, customerAccepts, adminDecidesFullRefund(dispute.id)))
      .toEqual(['accepted', 409]);
    expect(await escrowRefunds(database)).toEqual(['-300000']);
    expect(await customerBalance(database)).toBe('1300000');
    expect((await database.query('SELECT resolution_type FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ resolution_type: 'partial_refund' }]);
  });
}, 60000);

it('an admin partial refund refunds once, marks the payment record, then releases the provider share', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    const result = await adminResolveDispute(dispute.id, {
      resolutionType: 'partial_refund', refundPercent: 60, decisionNotes,
    } as Parameters<typeof adminResolveDispute>[1], operatorId);

    expect(result.refundAmount).toBe(600000);
    expect(await escrowRefunds(database)).toEqual(['-600000']);
    expect(await customerBalance(database)).toBe('1600000');
    expect(await paymentRecord(database)).toEqual([{ status: 'partially_refunded', refunded_amount: '600000' }]);
    // The provider's 400,000 share was released after the refund committed.
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('0');
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'resolved', escrow_status: 'released' }]);
    expect((await database.query(`SELECT action_type, target_id FROM admin_actions WHERE action_type='dispute_resolved'`)).rows)
      .toEqual([{ action_type: 'dispute_resolved', target_id: dispute.id }]);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

it('the dispute route resolver refunds once and marks the payment record', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    await disputeService.resolveDispute(dispute.id, operatorId, { resolutionType: 'full_refund', decisionNotes });

    expect(await escrowRefunds(database)).toEqual(['-1000000']);
    expect(await customerBalance(database)).toBe('2000000');
    expect(await paymentRecord(database)).toEqual([{ status: 'refunded', refunded_amount: '1000000' }]);
    expect((await database.query('SELECT status FROM disputes WHERE id=$1', [dispute.id])).rows)
      .toEqual([{ status: 'resolved' }]);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

it('a payment-record failure after a committed dispute refund queues only a payment-only retry linked to the dispute', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    const gateway = jest.spyOn(paymentService, 'processRefund')
      .mockRejectedValueOnce(new Error('Synthetic payment record outage'));
    try {
      const resolved = await disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic: I accept the claim.', 'accept');

      expect(resolved).toMatchObject({ status: 'resolved' });
      expect(gateway).toHaveBeenCalledWith(bookingB, 1000000, 'Provider accepted dispute — full refund');
      expect(await escrowRefunds(database)).toEqual(['-1000000']);
      expect(await customerBalance(database)).toBe('2000000');
      expect(await paymentRecord(database)).toEqual([{ status: 'succeeded', refunded_amount: '0' }]);
      // Only the payment record is retried; the escrow debit is never queued.
      expect(await retryRows(database)).toEqual([
        { action_type: 'process_payment_refund', dispute_id: dispute.id, amount_centavos: '1000000', status: 'pending' },
      ]);
    } finally {
      gateway.mockRestore();
    }
  });
}, 60000);
