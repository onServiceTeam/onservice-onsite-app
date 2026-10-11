import type { Pool } from 'pg';
import * as disputeService from '../src/services/dispute.service';
import { adminResolveDispute } from '../src/services/dispute-admin.service';
import { holdEscrowInTransaction } from '../src/services/wallet.service';
import { waitForWaiters } from './helpers/dispute-postgres';
import {
  withMoneyDisputeDatabase, heldFor, fileDisputeHttp, supportRefundB, noShowTimingB, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, bookingB, customerB, escrowWallet, operatorId, providerUserB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S2-2 supporting checks (FIN-020, FIN-021 and OPS-562 are the bug tests).

const filing = { type: 'substandard' as const, description: 'Synthetic dispute: the work was not done as agreed for this test.' };
const decisionNotes = 'Synthetic admin decision recorded for this test.';
type Failure = { statusCode?: number; code?: string; message?: string };
// A deadlock would surface as PostgreSQL code 40P01 instead of a status.
const outcome = (e: Failure) => `${e.statusCode ?? e.code ?? 'error'}: ${e.message}`;

async function walletAvailable(database: Pool, type: string, userId: string | null = null): Promise<number> {
  return Number((await database.query<{ b: string }>(`SELECT COALESCE(SUM(available_balance),0)::text AS b
    FROM wallets WHERE type=$1 AND ($2::uuid IS NULL OR user_id=$2)`, [type, userId])).rows[0]!.b);
}

it('filing a dispute on a fully held booking keeps its label "held"', async () => {
  await withMoneyDisputeDatabase(async database => {
    const filed = await fileDisputeHttp()(bookingB);

    expect(filed.status).toBe(201);
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'disputed', escrow_status: 'held' }]);
    expect(await heldFor(database, bookingB)).toBe(1000000);
  });
}, 60000);

// The decision locks the dispute and then the booking; the filing locks the
// booking and then only reads the open disputes. To make the filing really
// reach that read, booking B is put back to "completed" while its first
// dispute is still open: an inconsistent state older data could hold. Queued
// in either order on the booking lock, the two finish without a deadlock.
// Both orders always run and report.
it('a dispute filing racing a decision on the same booking does not deadlock, in either order', async () => {
  const outcomes: unknown[] = [];
  for (const order of ['decision first', 'filing first'] as const) {
    await withMoneyDisputeDatabase(async database => {
      const first = await disputeService.fileDispute(bookingB, customerB, filing);
      await database.query("UPDATE bookings SET status='completed_by_provider' WHERE id=$1", [bookingB]);
      const decide = () => adminResolveDispute(first.id, { resolutionType: 'no_refund', decisionNotes }, operatorId)
        .then(() => 'decided', outcome);
      const file = () => disputeService.fileDispute(bookingB, customerB, filing).then(() => 'filed', outcome);
      const blocker = await database.connect();
      let blockerOpen = false;
      const running: Array<Promise<string>> = [];
      try {
        await blocker.query('BEGIN');
        blockerOpen = true;
        await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
        const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        for (const start of order === 'decision first' ? [decide, file] : [file, decide]) {
          running.push(start());
          await waitForWaiters(database, pid, running.length);
        }
        await blocker.query('COMMIT');
        blockerOpen = false;

        outcomes.push({
          order,
          results: await Promise.all(running),
          disputes: (await database.query('SELECT status FROM disputes WHERE booking_id=$1', [bookingB])).rows,
          heldBystander: await heldFor(database, bystanderBooking),
        });
      } finally {
        if (blockerOpen) await blocker.query('ROLLBACK');
        await Promise.allSettled(running);
        blocker.release();
      }
    });
  }
  expect(outcomes).toEqual([
    {
      order: 'decision first',
      results: ['decided', '409: Disputes can only be filed after the provider marks the job as complete.'],
      disputes: [{ status: 'resolved' }],
      heldBystander: bystanderHeld,
    },
    {
      order: 'filing first',
      results: ['409: An active dispute already exists for this booking.', 'decided'],
      disputes: [{ status: 'resolved' }],
      heldBystander: bystanderHeld,
    },
  ]);
}, 120000);

// The automatic no-show refund needs both: the label "held" and the whole
// total still held. Each case qualifies by timing and must be filed for an
// admin instead, with no refund. Both cases always run and report.
it('a no-show dispute is filed for review when the label or the held amount does not show the full total', async () => {
  const outcomes: unknown[] = [];
  const cases: Array<[string, (database: Pool) => Promise<void>]> = [
    // Labelled "held" by older code after a 250,000 support refund.
    ['held label, short', async database => {
      expect((await supportRefundB(250000, requestKey)).status).toBe(200);
      await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]);
    }],
    // The whole total is held, but the label does not say so.
    ['full, label pending', async database => {
      await database.query("UPDATE bookings SET escrow_status='pending' WHERE id=$1", [bookingB]);
    }],
  ];
  for (const [name, arrange] of cases) {
    await withMoneyDisputeDatabase(async database => {
      await arrange(database);
      await noShowTimingB(database);
      const heldBefore = await heldFor(database, bookingB);

      const filed = await fileDisputeHttp()(bookingB, 'no_show');

      outcomes.push({
        name,
        filed: filed.status,
        dispute: filed.body.data?.status,
        booking: (await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows[0],
        heldUnchanged: await heldFor(database, bookingB) === heldBefore,
      });
    });
  }
  expect(outcomes).toEqual([
    { name: 'held label, short', filed: 201, dispute: 'open', booking: { status: 'disputed', escrow_status: 'held' }, heldUnchanged: true },
    { name: 'full, label pending', filed: 201, dispute: 'open', booking: { status: 'disputed', escrow_status: 'pending' }, heldUnchanged: true },
  ]);
}, 120000);

// Another escrow movement for booking B (a 50,000 hold) is in flight when a
// no-show dispute is filed. Its ledger row references the booking, so the
// filing's booking lock waits for it and then sees 1,050,000, not the
// 1,000,000 total: it is filed for review, and no stale full refund runs.
it('a no-show filing waits for an escrow movement in flight on the booking and sees the changed amount', async () => {
  await withMoneyDisputeDatabase(async database => {
    await noShowTimingB(database);
    const writer = await database.connect();
    let writerOpen = false;
    let running: Promise<unknown> | null = null;
    try {
      await writer.query('BEGIN');
      writerOpen = true;
      await holdEscrowInTransaction(writer, escrowWallet, 50000, bookingB);
      const pid = (await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      running = disputeService.fileDispute(bookingB, customerB, {
        type: 'no_show', description: 'Synthetic dispute: the provider never arrived for this test booking.',
      }).then(d => d.status, outcome);
      await waitForWaiters(database, pid, 1);
      await writer.query('COMMIT');
      writerOpen = false;

      expect(await running).toBe('open');
    } finally {
      if (writerOpen) await writer.query('ROLLBACK');
      if (running) await Promise.allSettled([running]);
      writer.release();
    }
    expect(await heldFor(database, bookingB)).toBe(1050000);
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'disputed', escrow_status: 'held' }]);
  });
}, 60000);

// A consequence of FIN-020: after a support refund the booking keeps the
// label "partially refunded", so a "no refund" decision on a later dispute
// now releases what the booking still holds to the provider (prorated, as a
// manual release after a support refund already does). Before S2-2 the filing
// relabelled it "held" and that release was refused. Pinned here; confirmed
// as a question for Ken in D36 Q1.
it('a no-refund decision on a dispute filed after a support refund releases what the booking holds', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    const dispute = await disputeService.fileDispute(bookingB, customerB, filing);

    await adminResolveDispute(dispute.id, { resolutionType: 'no_refund', decisionNotes }, operatorId);

    expect(await heldFor(database, bookingB)).toBe(0);
    expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
      .toEqual([{ status: 'resolved', escrow_status: 'released' }]);
    // 75% of the provider's 680,000 share.
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(510000);
    expect((await database.query("SELECT COUNT(*)::int AS n FROM gateway_retry_queue WHERE status <> 'succeeded'")).rows)
      .toEqual([{ n: 0 }]);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);
