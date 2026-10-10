import type { Response } from 'supertest';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../src/services/wallet.service';
import { appendAuthorizationTermsInTransaction } from '../src/services/booking-financial-terms.service';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp,
  customerA, customerWalletA, escrowWallet,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const racedBooking = '30000000-0000-4000-8000-000000000004';

it('Bug FIN-010 - a cancellation that waits on a payment refunds the money that payment put in escrow', async () => {
  await withParticipantRefundDatabase(async database => {
    // An unfunded wallet booking, still requested. Customer A's wallet holds
    // 150,000 centavos after the fixture's own booking.
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method,status,escrow_status,
        service_price,service_fee,total_amount)
      VALUES ($1,$2,'wallet','requested','pending',80000,20000,100000)`, [racedBooking, customerA]);

    // The blocker connection holds the booking lock, as the wallet payment
    // does while it moves the money.
    const blocker = await database.connect();
    let blockerOpen = true;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [racedBooking]);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;

      // The cancellation reads escrow "pending" before the lock, then waits.
      const inFlight: Promise<Response> = Promise.resolve(
        participantHttp(customerA, 'customer')(racedBooking, 'cancelled_by_customer'),
      );
      await waitForBlockedApproval(database, pid);

      // The payment commits first, through the real money helpers.
      await debitWalletInTransaction(blocker, customerWalletA, 100000, 'payment', 'Synthetic booking funding', racedBooking);
      await holdEscrowInTransaction(blocker, escrowWallet, 100000, racedBooking);
      await blocker.query(`INSERT INTO payment_intents(booking_id,amount,payment_method,status)
        VALUES ($1,100000,'wallet','succeeded')`, [racedBooking]);
      await blocker.query(`UPDATE bookings SET status='paid', escrow_status='held',
          payment_intent_id=(SELECT id FROM payment_intents WHERE booking_id=$1) WHERE id=$1`, [racedBooking]);
      await appendAuthorizationTermsInTransaction(blocker, {
        bookingId: racedBooking, event: 'wallet_payment_authorized', sourceEventId: racedBooking,
      });
      await blocker.query('COMMIT');
      blockerOpen = false;

      // Before FIN-010 this answered 200 with the booking cancelled, its
      // escrow still held and the customer's wallet still debited: the money
      // step trusted the "pending" it read before the lock.
      const response = await inFlight;
      expect(response.status).toBe(200);
      expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [racedBooking])).rows)
        .toEqual([{ status: 'cancelled_by_customer', escrow_status: 'refunded' }]);
      // Unassigned: the full price and fee return to the wallet.
      expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletA])).rows)
        .toEqual([{ available_balance: '150000' }]);
      expect((await database.query(`SELECT COALESCE(SUM(amount),0)::text AS remaining FROM wallet_transactions
          WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, racedBooking])).rows)
        .toEqual([{ remaining: '0' }]);
      expect((await database.query('SELECT status,refunded_amount::text FROM payment_intents WHERE booking_id=$1', [racedBooking])).rows)
        .toEqual([{ status: 'refunded', refunded_amount: '100000' }]);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      blocker.release();
    }
  });
}, 30000);
