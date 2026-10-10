import type { Pool } from 'pg';
import * as disputeService from '../src/services/dispute.service';
import { withDisputeDatabase, waitForWaiters } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, customerB, customerWalletB, escrowWallet, providerUserB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const substandard = { type: 'substandard' as const, description: 'Synthetic dispute: the work was incomplete.' };
const GUARD_409 = '409 This dispute already has a provider response or is no longer open.';

// Runs two copies of one provider response while a second connection holds
// the dispute row, so both have passed the unlocked "open and unanswered"
// pre-check before either writes. Returns each outcome as 'ok' or
// '<status> <message>'.
async function doubleTap(database: Pool, disputeId: string, send: () => Promise<unknown>): Promise<string[]> {
  const blocker = await database.connect();
  let blockerOpen = true;
  let taps: Array<Promise<string>> = [];
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM disputes WHERE id=$1 FOR UPDATE', [disputeId]);
    const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    taps = [0, 1].map(() => send().then(() => 'ok', (e: { statusCode?: number; code?: string; message?: string }) =>
      `${e.statusCode ?? e.code ?? 'error'} ${e.message}`));
    await waitForWaiters(database, pid, 2);
    await blocker.query('COMMIT');
    blockerOpen = false;
    return (await Promise.all(taps)).sort();
  } finally {
    if (blockerOpen) await blocker.query('ROLLBACK');
    await Promise.allSettled(taps);
    blocker.release();
  }
}

it('Bug OPS-561 - a provider\'s second concurrent response to one dispute is refused before it writes anything', async () => {
  // A double-tapped full acceptance: one refund, one inbox row.
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    const outcomes = await doubleTap(database, dispute.id,
      () => disputeService.addProviderResponse(dispute.id, providerUserB, 'Synthetic: I accept the claim.', 'accept'));

    // Before OPS-561 both taps answered OK: the accept update had no
    // "still open, not yet answered" guard (the contest path had one).
    expect(outcomes).toEqual([GUARD_409, 'ok']);
    expect((await database.query(`SELECT amount::text FROM wallet_transactions
        WHERE wallet_id=$1 AND booking_id=$2 AND type='refund'`, [escrowWallet, bookingB])).rows)
      .toEqual([{ amount: '-1000000' }]);
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletB])).rows)
      .toEqual([{ available_balance: '2000000' }]);
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM notifications
        WHERE user_id=$1 AND title='Provider Accepted Your Dispute'`, [customerB])).rows).toEqual([{ n: 1 }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM gateway_retry_queue')).rows).toEqual([{ n: 0 }]);
  });

  // A double-tapped partial offer: the first offer stands, one inbox row.
  await withDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, substandard);
    const amounts = [300000, 400000];
    let next = 0;
    const outcomes = await doubleTap(database, dispute.id, () => {
      const amount = amounts[next++]!;
      return disputeService.addProviderResponse(dispute.id, providerUserB, `Synthetic offer of ${amount}.`, 'partial_offer', amount);
    });

    // Before OPS-561 both answered OK and the second offer overwrote the first.
    expect(outcomes).toEqual([GUARD_409, 'ok']);
    const offer = (await database.query<{ refund_amount: string; provider_response: string }>(
      'SELECT refund_amount::text, provider_response FROM disputes WHERE id=$1', [dispute.id])).rows[0]!;
    expect(offer.provider_response).toBe(`Synthetic offer of ${offer.refund_amount}.`);
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM notifications
        WHERE user_id=$1 AND title='Provider Offered a Partial Refund'`, [customerB])).rows).toEqual([{ n: 1 }]);
    // An offer moves no money.
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM wallet_transactions
        WHERE booking_id=$1 AND type='refund'`, [bookingB])).rows).toEqual([{ n: 0 }]);
  });
}, 90000);
