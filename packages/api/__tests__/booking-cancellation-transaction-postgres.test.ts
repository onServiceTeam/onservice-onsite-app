import type { Pool } from 'pg';
import { db } from '../src/models/db';
import * as notificationService from '../src/services/notification.service';
import * as paymentService from '../src/services/payment.service';
import * as escrowService from '../src/services/escrow.service';
import { logger } from '../src/utils/logger';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  customerA, customerB, customerWalletB, escrowWallet, providerUserA, providerUserB, providerB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S1-5 supporting checks (FIN-009 and FIN-010 are the bug tests). Booking B is
// a paid wallet booking: price 800,000 and fee 200,000 centavos. It is assigned
// to provider B with real assignment terms and scheduled ten hours ahead, so
// the snapshotted 2-to-24-hour bracket refunds 75% of the price. The money is
// the same whoever cancels, until D-03 decides otherwise.
async function assignAndSchedule(database: Pool) {
  await db.transaction(async client => {
    await client.query(`UPDATE bookings SET provider_id=$2, scheduled_at=NOW() + INTERVAL '10 hours'
      WHERE id=$1`, [bookingB, providerB]);
    await appendProviderAssignmentTermsInTransaction(client, {
      bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
    });
  });
  // Device push stays disabled for the provider accounts too.
  await database.query('INSERT INTO notification_preferences(user_id) VALUES ($1),($2)', [providerUserA, providerUserB]);
}

async function expectBracketMoneyCommitted(database: Pool, status: string) {
  // participantHttp sends this reason with every status request.
  expect((await database.query(`SELECT status,escrow_status,cancellation_reason,
      cancelled_at IS NOT NULL AS stamped FROM bookings WHERE id=$1`, [bookingB])).rows)
    .toEqual([{ status, escrow_status: 'partially_refunded', cancellation_reason: 'Synthetic participant cancellation', stamped: true }]);
  // 1,000,000 left after funding; 600,000 (75% of the price) plus the
  // 200,000 fee comes back.
  expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletB])).rows)
    .toEqual([{ available_balance: '1800000' }]);
  expect((await database.query(`SELECT available_balance::text FROM wallets WHERE user_id=$1 AND type='provider'`,
    [providerUserB])).rows).toEqual([{ available_balance: '200000' }]);
  expect((await database.query(`SELECT COALESCE(SUM(amount),0)::text AS remaining FROM wallet_transactions
      WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, bookingB])).rows).toEqual([{ remaining: '0' }]);
  expect((await database.query('SELECT status,refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingB])).rows)
    .toEqual([{ status: 'partially_refunded', refunded_amount: '800000' }]);
}

it('a customer cancelling an assigned paid booking commits the bracket refund and provider compensation with the status', async () => {
  await withParticipantRefundDatabase(async database => {
    await assignAndSchedule(database);

    const response = await participantHttp(customerB, 'customer')(bookingB, 'cancelled_by_customer');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: bookingB, status: 'cancelled_by_customer', escrowStatus: 'partially_refunded' });
    await expectBracketMoneyCommitted(database, 'cancelled_by_customer');
    // A customer cancellation leaves the provider's cancellation record alone.
    expect((await database.query('SELECT total_cancellations,cancellations_last_30d FROM providers WHERE id=$1', [providerB])).rows)
      .toEqual([{ total_cancellations: 0, cancellations_last_30d: 0 }]);
    expect((await database.query('SELECT user_id,type FROM notifications')).rows)
      .toEqual([{ user_id: providerUserB, type: 'customer_cancelled' }]);
  });
}, 30000);

it('a provider cancelling commits the same money and its cancellation counters with the status', async () => {
  await withParticipantRefundDatabase(async database => {
    await assignAndSchedule(database);

    const response = await participantHttp(providerUserB, 'provider')(bookingB, 'cancelled_by_provider');
    expect(response.status).toBe(200);
    await expectBracketMoneyCommitted(database, 'cancelled_by_provider');
    const counters = (await database.query(`SELECT total_cancellations,cancellations_last_30d,
      last_cancellation_at IS NOT NULL AS stamped FROM providers WHERE id=$1`, [providerB])).rows;
    expect(counters).toEqual([{ total_cancellations: 1, cancellations_last_30d: 1, stamped: true }]);
    expect((await database.query('SELECT user_id,type FROM notifications')).rows)
      .toEqual([{ user_id: customerB, type: 'provider_cancelled' }]);
  });
}, 30000);

it('a failed payment refund call after the commit queues the payment-only retry and still answers 200', async () => {
  await withParticipantRefundDatabase(async database => {
    await assignAndSchedule(database);
    const gateway = jest.spyOn(paymentService, 'processRefund')
      .mockRejectedValueOnce(new Error('Synthetic payment refund outage'));
    try {
      const response = await participantHttp(customerB, 'customer')(bookingB, 'cancelled_by_customer');
      expect(response.status).toBe(200);
      expect(gateway).toHaveBeenCalledWith(bookingB, 800000, 'Customer-initiated cancellation');
      // The local money committed with the status: the wallet is credited,
      // the provider compensated and the escrow emptied. Only the payment
      // record's refund is left for the retry worker.
      expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'cancelled_by_customer', escrow_status: 'partially_refunded' }]);
      expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletB])).rows)
        .toEqual([{ available_balance: '1800000' }]);
      expect((await database.query('SELECT status,refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingB])).rows)
        .toEqual([{ status: 'succeeded', refunded_amount: '0' }]);
      expect((await database.query(`SELECT action_type,booking_id,amount_centavos::text,description,status FROM gateway_retry_queue`)).rows)
        .toEqual([{ action_type: 'process_payment_refund', booking_id: bookingB, amount_centavos: '800000',
          description: 'Customer cancellation refund', status: 'pending' }]);
    } finally {
      gateway.mockRestore();
    }
  });
}, 30000);

it('if the post-commit refund step throws, the committed cancellation still answers 200 and the failure is logged', async () => {
  await withParticipantRefundDatabase(async database => {
    await assignAndSchedule(database);
    const step = jest.spyOn(escrowService, 'processCancellationGatewayRefund')
      .mockRejectedValueOnce(new Error('Synthetic refund step failure'));
    try {
      const response = await participantHttp(customerB, 'customer')(bookingB, 'cancelled_by_customer');
      expect(response.status).toBe(200);
      expect(step).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Cancellation payment refund step failed after commit; reconcile the payment refund manually',
        expect.objectContaining({ bookingId: bookingB, customerRefundAmount: 600000, serviceFeeCentavos: 200000 }),
      );
      expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'cancelled_by_customer', escrow_status: 'partially_refunded' }]);
    } finally {
      step.mockRestore();
    }
  });
}, 30000);

it('a notification failure after the commit still answers 200 with the cancellation money done', async () => {
  await withParticipantRefundDatabase(async database => {
    await assignAndSchedule(database);
    const notify = jest.spyOn(notificationService, 'notifyBookingStatusChange')
      .mockRejectedValueOnce(new Error('Synthetic notification outage'));
    try {
      // Before S1-5 the unwrapped notification turned this committed
      // cancellation into a 500, inviting a retry that then gets 409.
      const response = await participantHttp(providerUserB, 'provider')(bookingB, 'cancelled_by_provider');
      expect(response.status).toBe(200);
      expect(notify).toHaveBeenCalledWith(customerB, bookingB, 'cancelled_by_provider');
      await expectBracketMoneyCommitted(database, 'cancelled_by_provider');
    } finally {
      notify.mockRestore();
    }
  });
}, 30000);

it('a failure after the money step rolls the money back with the status and counters', async () => {
  await withParticipantRefundDatabase(async database => {
    await assignAndSchedule(database);
    // The provider counter UPDATE runs after the escrow refund and the
    // provider compensation have been written on the same transaction.
    await database.query('ALTER TABLE providers ADD CONSTRAINT synthetic_counter_cap CHECK (total_cancellations = 0)');
    const before = await participantSnapshot(database);

    const response = await participantHttp(providerUserB, 'provider')(bookingB, 'cancelled_by_provider');
    expect(response.status).toBe(500);
    // Booking still paid and held; wallets, ledger, payment record, retry
    // queue, counters, notices and waitlist all unchanged.
    expect(await participantSnapshot(database)).toEqual(before);
    expect(logger.error).toHaveBeenCalledWith('Provider cancellation tracking update failed',
      expect.objectContaining({ bookingId: bookingB, providerId: providerB }));
  });
}, 30000);

it('an unpaid booking cancels with no reason and moves no money', async () => {
  await withParticipantRefundDatabase(async database => {
    const unpaidBooking = '30000000-0000-4000-8000-000000000005';
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method,status,escrow_status,
        service_price,service_fee,total_amount)
      VALUES ($1,$2,'wallet','requested','pending',80000,20000,100000)`, [unpaidBooking, customerA]);
    const before = await participantSnapshot(database);

    // The customer app leaves the reason out when its box is blank.
    const response = await participantHttp(customerA, 'customer')(unpaidBooking, 'cancelled_by_customer',
      { cancellationReason: undefined });
    expect(response.status).toBe(200);
    expect((await database.query(`SELECT status,escrow_status,cancellation_reason,
        cancelled_at IS NOT NULL AS stamped FROM bookings WHERE id=$1`, [unpaidBooking])).rows)
      .toEqual([{ status: 'cancelled_by_customer', escrow_status: 'pending', cancellation_reason: null, stamped: true }]);
    const after = await participantSnapshot(database);
    expect({ wallets: after.wallets, ledger: after.ledger, intents: after.intents, retry: after.retry, notifications: after.notifications })
      .toEqual({ wallets: before.wallets, ledger: before.ledger, intents: before.intents, retry: before.retry, notifications: before.notifications });
  });
}, 30000);
