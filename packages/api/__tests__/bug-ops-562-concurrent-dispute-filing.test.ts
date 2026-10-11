import * as disputeService from '../src/services/dispute.service';
import { waitForWaiters } from './helpers/dispute-postgres';
import { withMoneyDisputeDatabase } from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB, customerB } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const filing = { type: 'substandard' as const, description: 'Synthetic dispute: the work was not done as agreed for this test.' };

// A blocker holds booking B's row, both filings start and wait, then the
// blocker lets go. Only one dispute may result.
it('Bug OPS-562 - two simultaneous dispute filings for one booking create one dispute', async () => {
  await withMoneyDisputeDatabase(async database => {
    const blocker = await database.connect();
    let blockerOpen = false;
    const running: Array<Promise<string>> = [];
    try {
      await blocker.query('BEGIN');
      blockerOpen = true;
      await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      for (let i = 0; i < 2; i += 1) {
        running.push(disputeService.fileDispute(bookingB, customerB, filing)
          .then(() => 'filed', (error: { statusCode?: number; message?: string }) => `${error.statusCode}: ${error.message}`));
        await waitForWaiters(database, pid, i + 1);
      }
      await blocker.query('COMMIT');
      blockerOpen = false;

      const outcomes = (await Promise.all(running)).sort();
      // Before S2-2 both filings passed their unlocked checks: two disputes.
      // Now the second waits for the first, then finds the booking already
      // disputed on its locked row.
      expect(outcomes).toEqual(['409: An active dispute already exists for this booking.', 'filed']);
      expect((await database.query('SELECT COUNT(*)::int AS n FROM disputes WHERE booking_id=$1', [bookingB])).rows)
        .toEqual([{ n: 1 }]);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      await Promise.allSettled(running);
      blocker.release();
    }
  });
}, 60000);
