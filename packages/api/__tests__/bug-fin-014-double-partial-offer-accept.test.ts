import * as disputeService from '../src/services/dispute.service';
import { withDisputeDatabase, bookingEscrowLeft, waitForWaiters } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, customerB, customerWalletB, escrowWallet, providerUserB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug FIN-014 - two near-simultaneous accepts of one partial offer refund the customer once', async () => {
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, {
      type: 'substandard', description: 'Synthetic dispute: the work was incomplete.',
    });
    await disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic partial offer', 'partial_offer', 300000);

    // A second connection holds the dispute row while both accepts are in
    // flight. Before FIN-014 both had read the offer as still open, unlocked,
    // before either wrote; now both wait on the dispute lock, and the second
    // re-reads the row after the first commits.
    const blocker = await database.connect();
    let blockerOpen = true;
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM disputes WHERE id=$1 FOR UPDATE', [dispute.id]);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      first = disputeService.acceptPartialOffer(dispute.id, customerB).then(() => 'ok', (e: { statusCode?: number }) => e.statusCode ?? 'error');
      second = disputeService.acceptPartialOffer(dispute.id, customerB).then(() => 'ok', (e: { statusCode?: number }) => e.statusCode ?? 'error');
      await waitForWaiters(database, pid, 2);
      await blocker.query('COMMIT');
      blockerOpen = false;

      // Before FIN-014 both answered ok and the customer was refunded twice
      // (600,000), because nothing re-checked the offer after the wait.
      const outcomes = (await Promise.all([first, second])).sort();
      expect(outcomes).toEqual([409, 'ok']);
      expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletB])).rows)
        .toEqual([{ available_balance: '1300000' }]);
      const refunds = (await database.query(`SELECT amount::text FROM wallet_transactions
          WHERE wallet_id=$1 AND booking_id=$2 AND type='refund'`, [escrowWallet, bookingB])).rows;
      expect(refunds).toEqual([{ amount: '-300000' }]);
      // The provider's share (700,000) was released once; nothing is left.
      expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('0');
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      await Promise.allSettled([first, second].filter(Boolean) as Promise<unknown>[]);
      blocker.release();
    }
  });
}, 60000);
