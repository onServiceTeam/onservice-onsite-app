import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import { db } from '../src/models/db';
import * as escrowService from '../src/services/escrow.service';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../src/services/wallet.service';
import { logger } from '../src/utils/logger';
import { waitForWaiters } from './helpers/dispute-postgres';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, adminCancelHttp,
  reportNoShowHttp, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, participantHttp, snapshot, bookingA, bookingB, customerB,
  customerWalletB, escrowWallet, providerUserB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S2-1 supporting checks (FIN-017, FIN-018 and FIN-019 are the bug tests).
// Payouts that match what the booking holds still move exactly that; every
// escrow payout refuses a booking whose held amount differs from what it
// would pay, in either direction; and customers and providers get plain
// wording while the admin gets the detail.

async function walletAvailable(database: Pool, type: string, userId: string | null = null): Promise<number> {
  return Number((await database.query<{ b: string }>(`SELECT COALESCE(SUM(available_balance),0)::text AS b
    FROM wallets WHERE type=$1 AND ($2::uuid IS NULL OR user_id=$2)`, [type, userId])).rows[0]!.b);
}

async function stateOfB(database: Pool) {
  return (await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows[0];
}

function refusalLogs() {
  return (logger.error as jest.Mock).mock.calls
    .filter(([message]) => message === 'Escrow payout refused for operations review')
    .map(([, details]) => details);
}

// The production hourly columns (migration 145).
async function addHourlyColumns(database: Pool): Promise<void> {
  await database.query(`ALTER TABLE bookings ADD COLUMN estimated_hours numeric(5,2),
      ADD COLUMN work_completed_at timestamptz, ADD COLUMN billed_hours numeric(5,2);
    ALTER TABLE service_subcategories ADD COLUMN min_billable_minutes integer NOT NULL DEFAULT 60,
      ADD COLUMN billing_increment_minutes integer NOT NULL DEFAULT 30`);
}

// One hour worked of a two-hour estimate on booking B: the settlement bills
// 500,000 and refunds the other 500,000 of unused time.
async function makeBHourly(database: Pool): Promise<void> {
  await database.query(`UPDATE bookings SET is_hourly=TRUE, estimated_hours=2,
      work_started_at=NOW() - INTERVAL '2 hours', work_completed_at=NOW() - INTERVAL '1 hour' WHERE id=$1`, [bookingB]);
}

it('a partial decision with no earlier refund releases exactly the remainder the booking holds', async () => {
  await withMoneyDisputeDatabase(async database => {
    const filed = await fileDisputeHttp()(bookingB);
    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'partial_refund', refundPercent: 60 });

    expect(decided.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect((await stateOfB(database)).escrow_status).toBe('released');
    // 40% of the provider's 680,000 share.
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(272000);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM gateway_retry_queue')).rows).toEqual([{ n: 0 }]);
    expect(await heldFor(database, bookingA)).toBe(100000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('an admin no-show cancel of a fully held booking pays exactly what it holds', async () => {
  await withMoneyDisputeDatabase(async database => {
    await database.query("UPDATE bookings SET status='resolved' WHERE id=$1", [bookingB]);
    const revenueBefore = await walletAvailable(database, 'platform_revenue');

    const response = await adminCancelHttp()(bookingB, { customerNoShow: true });

    expect(response.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(800000);
    expect(await walletAvailable(database, 'platform_revenue') - revenueBefore).toBe(200000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('an admin cancel of a booking holding more than its total is refused, so nothing is stranded', async () => {
  await withMoneyDisputeDatabase(async database => {
    // A second 100,000 hold for booking B through the real wallet helpers.
    await db.transaction(async client => {
      await client.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
      await debitWalletInTransaction(client, customerWalletB, 100000, 'payment', 'Synthetic duplicate hold', bookingB);
      await holdEscrowInTransaction(client, escrowWallet, 100000, bookingB);
    });
    await database.query("UPDATE bookings SET status='resolved' WHERE id=$1", [bookingB]);
    const before = await participantSnapshot(database);

    const response = await adminCancelHttp()(bookingB, { customerNoShow: true });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      statusCode: 409,
      code: 'CANCELLATION_ESCROW_MISMATCH',
      message: "This booking holds ₱11,000.00 in escrow, not its full ₱10,000.00 (escrow label: held). Nothing was cancelled or paid. Do not change its status; ask finance to review this booking's payments first.",
    });
    expect(await participantSnapshot(database)).toEqual(before);
    expect(await heldFor(database, bookingB)).toBe(1100000);
  });
}, 60000);

it('a provider no-show report on a fully held booking whose escrow label is not "held" is refused', async () => {
  await withMoneyDisputeDatabase(async database => {
    await database.query(`UPDATE bookings SET status='provider_arrived', escrow_status='pending',
        scheduled_at=NOW() - INTERVAL '60 minutes' WHERE id=$1`, [bookingB]);
    const before = await participantSnapshot(database);

    const response = await reportNoShowHttp()(bookingB);

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      statusCode: 409,
      code: 'CANCELLATION_ESCROW_MISMATCH',
      message: "This booking's payment needs a check by our support team before the no-show can be recorded. Please contact support.",
    });
    expect(await participantSnapshot(database)).toEqual(before);
    expect(await heldFor(database, bookingB)).toBe(1000000);
  });
}, 60000);

it('a customer or provider cancelling a booking that holds less than its total is asked to contact support', async () => {
  const outcomes: unknown[] = [];
  for (const [userId, role, target] of [
    [customerB, 'customer', 'cancelled_by_customer'], [providerUserB, 'provider', 'cancelled_by_provider'],
  ] as const) {
    await withMoneyDisputeDatabase(async database => {
      expect((await supportRefundB(250000, requestKey)).status).toBe(200);
      // A "paid" booking whose label older code reset to "held".
      await database.query("UPDATE bookings SET status='paid', escrow_status='held' WHERE id=$1", [bookingB]);
      const before = await participantSnapshot(database);

      const response = await participantHttp(userId, role)(bookingB, target);

      outcomes.push({
        role,
        status: response.status,
        error: response.body.error,
        unchanged: isDeepStrictEqual(await participantSnapshot(database), before),
        heldB: await heldFor(database, bookingB),
      });
    });
  }
  const contactSupport = (role: string) => ({
    role,
    status: 409,
    error: {
      statusCode: 409,
      code: 'CANCELLATION_ESCROW_MISMATCH',
      message: "This booking's payment needs a check by our support team before it can be cancelled. Please contact support.",
    },
    unchanged: true,
    heldB: 750000,
  });
  expect(outcomes).toEqual([contactSupport('customer'), contactSupport('provider')]);
}, 120000);

it('a partial release of a different amount than the booking holds is refused with its own code', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    await database.query("UPDATE bookings SET status='resolved' WHERE id=$1", [bookingB]);
    const before = await participantSnapshot(database);

    await expect(escrowService.releasePartialEscrow(bookingB, 800000)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ESCROW_RELEASE_AMOUNT_MISMATCH',
      message: "This release of ₱8,000.00 does not match the ₱7,500.00 this booking still holds in escrow. Nothing was paid. Ask finance to review this booking's payments before releasing or refunding it.",
    });
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 60000);

// Runs a release on another connection while `writer` holds an uncommitted
// escrow movement for booking B, waits until the release is blocked, then
// commits the movement and returns the release's outcome. The movement's
// ledger row references booking B, and that foreign key takes a key-share
// lock on the booking row, so the release waits at its booking lock.
async function releaseRacingAHold(database: Pool, release: () => Promise<unknown>): Promise<unknown> {
  const writer = await database.connect();
  let writerOpen = false;
  let running: Promise<unknown> | null = null;
  try {
    await writer.query('BEGIN');
    writerOpen = true;
    await holdEscrowInTransaction(writer, escrowWallet, 50000, bookingB);
    const pid = (await writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    running = release().then(() => 'released', (error: unknown) => error);
    await waitForWaiters(database, pid, 1);
    await writer.query('COMMIT');
    writerOpen = false;
    return await running;
  } finally {
    if (writerOpen) await writer.query('ROLLBACK');
    if (running) await Promise.allSettled([running]);
    writer.release();
  }
}

// A full release reads the held amount itself once it has the booking lock,
// so its older check refuses the changed amount first. This passes on the
// code before S2-1 too: it pins the booking-row serialisation S2-1 relies on.
it('a full release that waits on another escrow movement for the booking refuses the changed amount', async () => {
  await withMoneyDisputeDatabase(async database => {
    await database.query("UPDATE bookings SET status='resolved' WHERE id=$1", [bookingB]);

    expect(await releaseRacingAHold(database, () => escrowService.releaseEscrow(bookingB))).toMatchObject({
      statusCode: 409,
      message: "Held escrow does not match this booking's immutable financial terms. Release is blocked for operations review.",
    });
    expect(await heldFor(database, bookingB)).toBe(1050000);
    expect(await stateOfB(database)).toEqual({ status: 'resolved', escrow_status: 'held' });
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

// A partial release has no earlier check of what the booking holds; the S2-1
// check is the only one. Before S2-1 this paid out the stale 750,000, marked
// the escrow released and stranded the new 50,000.
it('a partial release that waits on another escrow movement for the booking refuses the changed amount', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    await database.query("UPDATE bookings SET status='resolved' WHERE id=$1", [bookingB]);

    expect(await releaseRacingAHold(database, () => escrowService.releasePartialEscrow(bookingB, 750000))).toMatchObject({
      statusCode: 409,
      code: 'ESCROW_RELEASE_AMOUNT_MISMATCH',
      message: "This release of ₱7,500.00 does not match the ₱8,000.00 this booking still holds in escrow. Nothing was paid. Ask finance to review this booking's payments before releasing or refunding it.",
    });
    expect(await heldFor(database, bookingB)).toBe(800000);
    expect(await stateOfB(database)).toEqual({ status: 'resolved', escrow_status: 'partially_refunded' });
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('an hourly settlement refuses an unused-time refund larger than what the booking holds', async () => {
  await withMoneyDisputeDatabase(async database => {
    await addHourlyColumns(database);
    // Support refunded 800,000, so B holds 200,000; the settlement would
    // refund 500,000 of unused time.
    expect((await supportRefundB(800000, requestKey)).status).toBe(200);
    await makeBHourly(database);
    (logger.error as jest.Mock).mockClear();
    const before = await participantSnapshot(database);

    await expect(db.transaction(client => escrowService.settleHourlyAndReleaseInTransaction(client, bookingB)))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'HOURLY_REFUND_EXCEEDS_BOOKING_ESCROW',
        message: "This booking holds ₱2,000.00 in escrow, less than the ₱5,000.00 unused-time refund. Nothing was settled or paid. Ask finance to review this booking's payments.",
      });
    expect(await participantSnapshot(database)).toEqual(before);
    expect(await heldFor(database, bookingB)).toBe(200000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
    expect(refusalLogs()).toEqual([
      { code: 'HOURLY_REFUND_EXCEEDS_BOOKING_ESCROW', bookingId: bookingB, heldCentavos: 200000, refundCentavos: 500000 },
    ]);
  });
}, 60000);

it('a customer confirming a fully held hourly booking settles the hours and releases the rest', async () => {
  await withMoneyDisputeDatabase(async database => {
    await addHourlyColumns(database);
    await makeBHourly(database);
    const customerBefore = await walletAvailable(database, 'customer', customerB);

    const response = await participantHttp(customerB, 'customer')(bookingB, 'confirmed');

    expect(response.status).toBe(200);
    expect(await stateOfB(database)).toEqual({ status: 'payout_ready', escrow_status: 'released' });
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'customer', customerB) - customerBefore).toBe(500000);
    const settled = (await database.query<{ fixed_by_event: string; total: string; provider: string }>(
      `SELECT fixed_by_event, total_amount_centavos::text AS total, provider_receives_centavos::text AS provider
         FROM booking_financial_terms WHERE booking_id=$1 ORDER BY version DESC LIMIT 1`, [bookingB])).rows[0]!;
    expect({ event: settled.fixed_by_event, total: settled.total }).toEqual({ event: 'hourly_settled', total: '500000' });
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(Number(settled.provider));
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('a customer confirming an hourly booking that holds too little is asked to contact support and nothing moves', async () => {
  await withMoneyDisputeDatabase(async database => {
    await addHourlyColumns(database);
    expect((await supportRefundB(800000, requestKey)).status).toBe(200);
    // The label older code could leave: "held", holding 200,000.
    await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]);
    await makeBHourly(database);
    const moneyBefore = await snapshot(database);

    const response = await participantHttp(customerB, 'customer')(bookingB, 'confirmed');

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      statusCode: 409,
      code: 'HOURLY_REFUND_EXCEEDS_BOOKING_ESCROW',
      message: "This booking's payment needs a check by our support team before it can be completed. Please contact support.",
    });
    // The confirmation itself was saved first, as before S2-1; no money moved.
    expect(await snapshot(database)).toEqual(moneyBefore);
    expect(await stateOfB(database)).toEqual({ status: 'confirmed', escrow_status: 'held' });
    expect(await heldFor(database, bookingB)).toBe(200000);
  });
}, 60000);
