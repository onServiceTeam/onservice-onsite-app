import type { Pool } from 'pg';
import { logger } from '../src/utils/logger';
import { db } from '../src/models/db';
import * as disputeService from '../src/services/dispute.service';
import { holdEscrowInTransaction } from '../src/services/wallet.service';
import { waitForWaiters } from './helpers/dispute-postgres';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, confirmedButReleasedB,
  hourlyUnsettledB, decisionSnapshot, decisionRefusalLog,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, bookingB, customerB, escrowWallet, operatorId, providerB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S2-3 supporting checks: decisions that are refused before anything is
// recorded (FIN-022, FIN-023, FIN-025 and FIN-026 are the bug tests). Each
// test compares the whole decision snapshot (money, bookings, payment
// records, audit rows, retries, notifications, providers, terms and the
// dispute rows) before and after.

const afterEarlierRefund = 'This booking was already partly refunded: it holds ₱7,500.00 of its ₱10,000.00 total. A refund decision after an earlier refund is on hold until the owner decides how to count it. Nothing was recorded or moved; leave the dispute open until then.';
const filing = { type: 'substandard' as const, description: 'Synthetic dispute: the work was not done as agreed for this test.' };
const decisionNotes = 'Synthetic admin decision recorded for this test.';

function nothingHeld(label: string): string {
  return `This booking holds no money in escrow that a refund could be paid from (escrow label: ${label}). Nothing was recorded or moved; ask finance how to handle it.`;
}
function mismatch(held: string, label: string): string {
  return `This booking's escrow does not add up: it holds ${held} of its ₱10,000.00 total, but its escrow label is "${label}". Nothing was recorded or moved; ask finance to review this booking's payments first.`;
}

function refusalCodes(level: 'error' | 'warn'): unknown[] {
  return (logger[level] as jest.Mock).mock.calls
    .filter(([message]) => message === decisionRefusalLog)
    .map(([, details]) => (details as { code: string }).code);
}

beforeEach(() => {
  (logger.error as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
});

// Files a dispute on booking B, runs `prepare`, then makes the decision over
// HTTP and checks the refusal and that nothing changed.
async function expectRefused(
  database: Pool, body: Record<string, unknown>, code: string, message: string, prepare?: () => Promise<void>,
): Promise<void> {
  const filed = await fileDisputeHttp()(bookingB);
  expect(filed.status).toBe(201);
  if (prepare) await prepare();
  const before = await decisionSnapshot(database);

  const decided = await adminResolveHttp()(filed.body.data.id, body);

  expect(decided.status).toBe(409);
  expect(decided.body.error).toEqual({ statusCode: 409, code, message });
  expect(await decisionSnapshot(database)).toEqual(before);
}

it('a full-refund decision after an earlier refund is held back too, and moves nothing', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    await expectRefused(database, { resolutionType: 'full_refund' }, 'DISPUTE_DECISION_AFTER_EARLIER_REFUND', afterEarlierRefund);
    expect(refusalCodes('warn')).toEqual(['DISPUTE_DECISION_AFTER_EARLIER_REFUND']);
    expect(refusalCodes('error')).toEqual([]);
  });
}, 60000);

// The booking's own refund cap already refused this before S2-3 (it asks
// for 800,000 of the 750,000 held); now the mismatch refuses it first.
it('a refund decision larger than a wrongly labelled booking holds is refused for the mismatch', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    await expectRefused(database, { resolutionType: 'partial_refund', refundPercent: 80 }, 'DISPUTE_ESCROW_MISMATCH',
      mismatch('₱7,500.00', 'held'),
      async () => { await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]); });
    expect(refusalCodes('error')).toEqual(['DISPUTE_ESCROW_MISMATCH']);
  });
}, 60000);

it('a refund-with-suspension decision on money already paid out is refused and does not suspend the provider', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    await expectRefused(database, { resolutionType: 'refund_with_suspension' }, 'DISPUTE_NOTHING_HELD', nothingHeld('released'));
    expect((await database.query('SELECT status FROM providers WHERE id=$1', [providerB])).rows).toEqual([{ status: 'approved' }]);
    expect(refusalCodes('error')).toEqual(['DISPUTE_NOTHING_HELD']);
  });
}, 60000);

it('a refund decision on a booking already refunded in full is refused as nothing held', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(1000000, requestKey)).status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    await expectRefused(database, { resolutionType: 'full_refund' }, 'DISPUTE_NOTHING_HELD', nothingHeld('refunded'));
  });
}, 60000);

// The next five are states older code could leave behind (LAUNCH-LIMITATIONS
// 121): the label says one thing and the ledger another.

it('a refund decision on a booking labelled held that holds nothing is refused as nothing held', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    await expectRefused(database, { resolutionType: 'full_refund' }, 'DISPUTE_NOTHING_HELD', nothingHeld('held'),
      async () => { await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]); });
  });
}, 60000);

it('a no-refund decision on a booking labelled held that holds nothing is refused for the mismatch', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    await expectRefused(database, { resolutionType: 'no_refund' }, 'DISPUTE_ESCROW_MISMATCH', mismatch('₱0.00', 'held'),
      async () => { await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]); });
  });
}, 60000);

it('a no-refund decision on a booking labelled held that holds more than its total is refused for the mismatch', async () => {
  await withMoneyDisputeDatabase(async database => {
    // A second hold of 100,000 on booking B, as a duplicated hold would leave.
    await db.transaction(async client => {
      await client.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
      await holdEscrowInTransaction(client, escrowWallet, 100000, bookingB);
    });
    await expectRefused(database, { resolutionType: 'no_refund' }, 'DISPUTE_ESCROW_MISMATCH', mismatch('₱11,000.00', 'held'));
  });
}, 60000);

it('a no-refund decision on a booking labelled released that still holds its money is refused for the mismatch', async () => {
  await withMoneyDisputeDatabase(async database => {
    await expectRefused(database, { resolutionType: 'no_refund' }, 'DISPUTE_ESCROW_MISMATCH', mismatch('₱10,000.00', 'released'),
      async () => { await database.query("UPDATE bookings SET escrow_status='released' WHERE id=$1", [bookingB]); });
  });
}, 60000);

it('a no-refund decision on a booking labelled partly refunded that still holds its whole total is refused for the mismatch', async () => {
  await withMoneyDisputeDatabase(async database => {
    await expectRefused(database, { resolutionType: 'no_refund' }, 'DISPUTE_ESCROW_MISMATCH', mismatch('₱10,000.00', 'partially_refunded'),
      async () => { await database.query("UPDATE bookings SET escrow_status='partially_refunded' WHERE id=$1", [bookingB]); });
  });
}, 60000);

it('the older dispute decision route holds back a partial decision after an earlier refund the same way', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    const dispute = await disputeService.fileDispute(bookingB, customerB, filing);
    const before = await decisionSnapshot(database);

    await expect(disputeService.resolveDispute(dispute.id, operatorId, {
      resolutionType: 'partial_refund', refundPercent: 60, decisionNotes,
    })).rejects.toMatchObject({ statusCode: 409, code: 'DISPUTE_DECISION_AFTER_EARLIER_REFUND', message: afterEarlierRefund });
    expect(await decisionSnapshot(database)).toEqual(before);
  });
}, 60000);

// The held amount is read under the booking lock. A blocker adds a hold of
// 100,000 to booking B without committing. Its ledger row's foreign key takes
// a key-share lock on the booking, which is all that makes the decision's
// FOR UPDATE wait; the decision then sees 1,100,000 and is refused instead
// of releasing on the stale amount.
it('a decision waits for an escrow movement in flight on the booking and judges the changed amount', async () => {
  await withMoneyDisputeDatabase(async database => {
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    const blocker = await database.connect();
    let blockerOpen = false;
    let decision: Promise<{ status: number; body: { error?: unknown } }> | undefined;
    try {
      await blocker.query('BEGIN');
      blockerOpen = true;
      const notificationsBefore = (await database.query('SELECT COUNT(*)::int AS n FROM notifications')).rows;
      await holdEscrowInTransaction(blocker, escrowWallet, 100000, bookingB);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      decision = adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' }).then(response => response);
      await waitForWaiters(database, pid, 1);
      await blocker.query('COMMIT');
      blockerOpen = false;
      const decided = await decision;
      expect(decided.status).toBe(409);
      expect(decided.body.error).toEqual({
        statusCode: 409, code: 'DISPUTE_ESCROW_MISMATCH', message: mismatch('₱11,000.00', 'held'),
      });
      expect(await heldFor(database, bookingB)).toBe(1100000);
      expect((await database.query('SELECT COUNT(*)::int AS n FROM gateway_retry_queue')).rows).toEqual([{ n: 0 }]);
      expect((await database.query('SELECT status FROM disputes WHERE booking_id=$1', [bookingB])).rows).toEqual([{ status: 'open' }]);
      expect((await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'disputed', escrow_status: 'held' }]);
      expect((await database.query('SELECT COUNT(*)::int AS n FROM notifications')).rows).toEqual(notificationsBefore);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      if (decision) await Promise.allSettled([decision]);
      blocker.release();
    }
  });
}, 60000);

// The order of the checks: a refund with nothing held is reported as
// nothing held, and a label that disagrees with the money as a mismatch,
// before the earlier-refund hold, so each anomaly is logged at error.
it('a refund decision on a booking labelled partly refunded that holds nothing is refused as nothing held', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    await expectRefused(database, { resolutionType: 'full_refund' }, 'DISPUTE_NOTHING_HELD', nothingHeld('partially_refunded'),
      async () => { await database.query("UPDATE bookings SET escrow_status='partially_refunded' WHERE id=$1", [bookingB]); });
    expect(refusalCodes('error')).toEqual(['DISPUTE_NOTHING_HELD']);
    expect(refusalCodes('warn')).toEqual([]);
  });
}, 60000);

it('a refund decision on a booking labelled partly refunded that still holds its whole total is refused for the mismatch', async () => {
  await withMoneyDisputeDatabase(async database => {
    await expectRefused(database, { resolutionType: 'partial_refund', refundPercent: 50 }, 'DISPUTE_ESCROW_MISMATCH',
      mismatch('₱10,000.00', 'partially_refunded'),
      async () => { await database.query("UPDATE bookings SET escrow_status='partially_refunded' WHERE id=$1", [bookingB]); });
    expect(refusalCodes('error')).toEqual(['DISPUTE_ESCROW_MISMATCH']);
    expect(refusalCodes('warn')).toEqual([]);
  });
}, 60000);

// After an earlier refund, a refund decision is held for D36 Q1 and a
// no-refund decision on an unsettled hourly booking for D36 Q10, so such a
// dispute cannot be decided at all yet; the text says so.
it('a no-refund decision on an hourly booking not yet settled that was partly refunded is held back with its own text', async () => {
  await withMoneyDisputeDatabase(async database => {
    await hourlyUnsettledB(database);
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    await expectRefused(database, { resolutionType: 'no_refund' }, 'DISPUTE_HOURLY_UNSETTLED', "This hourly booking has not been settled to the hours worked, so this decision would pay the provider for the estimated hours. Nothing was recorded or moved. It was also partly refunded earlier, so no decision can be made until the owner decides how both are counted; leave the dispute open.");
  });
}, 60000);

it('a partial decision on an hourly booking not yet settled is held back', async () => {
  await withMoneyDisputeDatabase(async database => {
    await hourlyUnsettledB(database);
    await expectRefused(database, { resolutionType: 'partial_refund', refundPercent: 50 }, 'DISPUTE_HOURLY_UNSETTLED',
      'This hourly booking has not been settled to the hours worked, so this decision would pay the provider for the estimated hours. Nothing was recorded or moved. Until the owner decides how hourly disputes are counted, only a full refund can be decided; otherwise leave the dispute open.');
    expect(refusalCodes('warn')).toEqual(['DISPUTE_HOURLY_UNSETTLED']);
  });
}, 60000);
