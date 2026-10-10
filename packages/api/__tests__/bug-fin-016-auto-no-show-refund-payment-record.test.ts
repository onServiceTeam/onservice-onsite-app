import * as disputeService from '../src/services/dispute.service';
import { withDisputeDatabase } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, customerB, customerWalletB, escrowWallet, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug FIN-016 - an automatic no-show refund marks the booking payment record as refunded', async () => {
  await withDisputeDatabase(async database => {
    // Marked complete ten minutes after the scheduled start: inside the
    // default 30-minute no-show window, so filing resolves automatically.
    await database.query(`UPDATE bookings SET scheduled_at=NOW() - INTERVAL '30 minutes',
        completed_at=NOW() - INTERVAL '20 minutes' WHERE id=$1`, [bookingB]);

    const dispute = await disputeService.fileDispute(bookingB, customerB, {
      type: 'no_show', description: 'Synthetic dispute: the provider never arrived.',
    });

    expect(dispute).toMatchObject({ status: 'resolved', auto_resolved: true });
    expect((await database.query(`SELECT amount::text FROM wallet_transactions
        WHERE wallet_id=$1 AND booking_id=$2 AND type='refund'`, [escrowWallet, bookingB])).rows)
      .toEqual([{ amount: '-1000000' }]);
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletB])).rows)
      .toEqual([{ available_balance: '2000000' }]);
    // Before FIN-016 the escrow refund committed but the payment record still
    // read succeeded with nothing refunded: no payment-record step ran.
    expect((await database.query('SELECT status, refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingB])).rows)
      .toEqual([{ status: 'refunded', refunded_amount: '1000000' }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM gateway_retry_queue')).rows).toEqual([{ n: 0 }]);
  });
}, 60000);
