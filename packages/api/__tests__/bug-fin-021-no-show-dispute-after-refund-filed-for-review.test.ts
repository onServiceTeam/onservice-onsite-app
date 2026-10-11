import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, noShowTimingB, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB, escrowWallet, requestKey } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Booking B qualifies for the automatic no-show refund by timing, but support
// already refunded 250,000 of it. A full automatic refund of 1,000,000 cannot
// be honest, so the dispute is filed for an admin to decide.
it('Bug FIN-021 - a no-show dispute on a partly refunded booking is filed for review instead of failing', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    await noShowTimingB(database);
    const refundRowsBefore = (await database.query(`SELECT COUNT(*)::int AS n FROM wallet_transactions
        WHERE wallet_id=$1 AND booking_id=$2 AND type='refund'`, [escrowWallet, bookingB])).rows[0].n;

    const filed = await fileDisputeHttp()(bookingB, 'no_show');

    // Before S2-2 the filing answered 409 ("Refund exceeds this booking's
    // remaining escrow") and no dispute was recorded.
    expect({
      filed: filed.status,
      dispute: filed.body.data && { status: filed.body.data.status, autoResolved: filed.body.data.autoResolved },
      booking: (await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows[0],
      held: await heldFor(database, bookingB),
      newRefundRows: (await database.query(`SELECT COUNT(*)::int AS n FROM wallet_transactions
          WHERE wallet_id=$1 AND booking_id=$2 AND type='refund'`, [escrowWallet, bookingB])).rows[0].n - refundRowsBefore,
      heldBystander: await heldFor(database, bystanderBooking),
      adminNote: (await database.query('SELECT internal_notes FROM disputes WHERE booking_id=$1', [bookingB])).rows[0]?.internal_notes,
    }).toEqual({
      filed: 201,
      dispute: { status: 'open', autoResolved: false },
      booking: { status: 'disputed', escrow_status: 'partially_refunded' },
      held: 750000,
      newRefundRows: 0,
      heldBystander: bystanderHeld,
      adminNote: 'Automatic no-show refund not run: this booking holds ₱7,500.00 of its ₱10,000.00 total (escrow label: partially_refunded). Decide this dispute manually.',
    });
  });
}, 60000);
