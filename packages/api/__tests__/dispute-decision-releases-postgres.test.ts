import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import * as disputeService from '../src/services/dispute.service';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, confirmedButReleasedB,
  bystanderBooking, bystanderHeld, hourlyUnsettledB, decisionSnapshot,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, bookingB, customerB, customerWalletB, operatorId, providerUserB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S2-3 supporting checks: decisions that go through, and what they release
// afterwards (FIN-024 is the bug test). Booking B's provider share of a fully
// held booking is 680,000 (85% of the 800,000 price).

const filing = { type: 'substandard' as const, description: 'Synthetic dispute: the work was not done as agreed for this test.' };
const decisionNotes = 'Synthetic admin decision recorded for this test.';

async function walletAvailable(database: Pool, type: string, userId: string | null = null): Promise<number> {
  return Number((await database.query<{ b: string }>(`SELECT COALESCE(SUM(available_balance),0)::text AS b
    FROM wallets WHERE type=$1 AND ($2::uuid IS NULL OR user_id=$2)`, [type, userId])).rows[0]!.b);
}

async function retryRows(database: Pool): Promise<unknown[]> {
  return (await database.query('SELECT action_type, status FROM gateway_retry_queue ORDER BY created_at')).rows;
}

async function customerWallet(database: Pool): Promise<number> {
  return Number((await database.query<{ b: string }>('SELECT available_balance::text AS b FROM wallets WHERE id=$1',
    [customerWalletB])).rows[0]!.b);
}

it('a no-refund decision on a booking labelled partly refunded that holds nothing is recorded and queues no release', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    await database.query("UPDATE bookings SET escrow_status='partially_refunded' WHERE id=$1", [bookingB]);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect(decided.status).toBe(200);
    expect((await database.query('SELECT status, resolution_type FROM disputes WHERE booking_id=$1', [bookingB])).rows)
      .toEqual([{ status: 'resolved', resolution_type: 'no_refund' }]);
    expect(await retryRows(database)).toEqual([]);
    expect(await heldFor(database, bookingB)).toBe(0);
  });
}, 60000);

it('the older dispute decision route records a no-refund decision on money already paid out without queueing a release', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    const dispute = await disputeService.fileDispute(bookingB, customerB, filing);

    const resolved = await disputeService.resolveDispute(dispute.id, operatorId, { resolutionType: 'no_refund', decisionNotes });

    expect(resolved).toMatchObject({ status: 'resolved', resolution_type: 'no_refund' });
    expect(await retryRows(database)).toEqual([]);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('the older dispute decision route releases a fully held booking after a no-refund decision', async () => {
  await withMoneyDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, filing);

    const resolved = await disputeService.resolveDispute(dispute.id, operatorId, { resolutionType: 'no_refund', decisionNotes });

    expect(resolved).toMatchObject({ status: 'resolved', resolution_type: 'no_refund' });
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(680000);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

// The admin route and console refuse a 0% partial decision; the older route
// accepts one. It refunds nothing and releases what the booking holds, the
// same as a 0% split (S2-3 keeps the release on "the refund is zero").
it('the older dispute decision route releases a fully held booking after a 0% partial decision', async () => {
  await withMoneyDisputeDatabase(async database => {
    const dispute = await disputeService.fileDispute(bookingB, customerB, filing);

    const resolved = await disputeService.resolveDispute(dispute.id, operatorId, {
      resolutionType: 'partial_refund', refundPercent: 0, decisionNotes,
    });

    expect(resolved).toMatchObject({ status: 'resolved', resolution_type: 'partial_refund' });
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(680000);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

it('a 0% split decision on a fully held booking releases the whole booking to the provider side, as before', async () => {
  await withMoneyDisputeDatabase(async database => {
    const filed = await fileDisputeHttp()(bookingB);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'split_decision', refundPercent: 0 });

    expect(decided.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(680000);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

// A full refund returns exactly what the customer paid, so it is allowed on
// an hourly booking before its hours are settled.
it('a full-refund decision on an hourly booking not yet settled still goes through', async () => {
  await withMoneyDisputeDatabase(async database => {
    await hourlyUnsettledB(database);
    const filed = await fileDisputeHttp()(bookingB);
    const walletBefore = await customerWallet(database);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'full_refund' });

    expect(decided.status).toBe(200);
    expect(await customerWallet(database)).toBe(walletBefore + 1000000);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(0);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

// A decision on an hourly booking that holds nothing pays nobody, so it is
// recorded. Support refunded the whole booking first.
it('a no-refund decision on an hourly booking not yet settled whose money was refunded is recorded and pays nothing', async () => {
  await withMoneyDisputeDatabase(async database => {
    await hourlyUnsettledB(database);
    expect((await supportRefundB(1000000, requestKey)).status).toBe(200);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect(decided.status).toBe(200);
    expect((await database.query('SELECT status, resolution_type FROM disputes WHERE booking_id=$1', [bookingB])).rows)
      .toEqual([{ status: 'resolved', resolution_type: 'no_refund' }]);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(0);
    expect((await database.query("SELECT COUNT(*)::int AS n FROM gateway_retry_queue WHERE status <> 'succeeded'")).rows)
      .toEqual([{ n: 0 }]);
  });
}, 60000);

// The same after a super admin's manual release paid the money out.
it('a no-refund decision on an hourly booking whose money was already released is recorded and pays nothing again', async () => {
  await withMoneyDisputeDatabase(async database => {
    await hourlyUnsettledB(database);
    await confirmedButReleasedB(database);
    const provider = await walletAvailable(database, 'provider', providerUserB);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect(decided.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(provider);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

// The hourly hold uses the settlement's own test for an hourly booking.
// A booking already settled (billed hours recorded; set here by direct SQL,
// because a settled booking is normally past the point a dispute can be
// filed) is released as a fixed-price booking would be; so is one marked
// hourly with no estimate, and one with an estimate but not marked hourly.
it.each([
  ['an hourly booking already settled to the hours worked', 'is_hourly=TRUE, estimated_hours=2, billed_hours=2'],
  ['a booking marked hourly with no estimated hours', 'is_hourly=TRUE, estimated_hours=NULL'],
  ['a booking with estimated hours but not marked hourly', 'is_hourly=FALSE, estimated_hours=2'],
])('a no-refund decision on %s releases the whole booking', async (_label, columns) => {
  await withMoneyDisputeDatabase(async database => {
    await database.query(`UPDATE bookings SET ${columns} WHERE id=$1`, [bookingB]);
    const filed = await fileDisputeHttp()(bookingB);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect(decided.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(680000);
    expect(await retryRows(database)).toEqual([]);
  });
}, 60000);

// R-MON-03 acceptance, over HTTP. Support refunds 250,000 of booking B; the
// customer disputes; the refund decisions are held back with nothing moved;
// a "no refund" decision then releases exactly what the booking still holds.
// The other bookings and the payment record never move beyond that.
it('R-MON-03 - after a support refund, dispute decisions never pay out more than the booking holds', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    const decide = adminResolveHttp();
    const before = await decisionSnapshot(database);

    const refused = [];
    for (const body of [{ resolutionType: 'partial_refund', refundPercent: 60 }, { resolutionType: 'full_refund' }]) {
      const response = await decide(filed.body.data.id, body);
      refused.push({ status: response.status, code: response.body.error?.code });
    }
    expect(refused).toEqual([
      { status: 409, code: 'DISPUTE_DECISION_AFTER_EARLIER_REFUND' },
      { status: 409, code: 'DISPUTE_DECISION_AFTER_EARLIER_REFUND' },
    ]);
    expect(isDeepStrictEqual(await decisionSnapshot(database), before)).toBe(true);

    const released = await decide(filed.body.data.id, { resolutionType: 'no_refund' });

    expect(released.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(0);
    // 75% of the provider's 680,000 share.
    expect(await walletAvailable(database, 'provider', providerUserB)).toBe(510000);
    expect((await database.query('SELECT status, refunded_amount::text FROM payment_intents WHERE booking_id=$1', [bookingB])).rows)
      .toEqual([{ status: 'partially_refunded', refunded_amount: '250000' }]);
    // The support refund's own payment step is a retry row that already
    // succeeded; nothing else may be queued.
    expect((await database.query("SELECT COUNT(*)::int AS n FROM gateway_retry_queue WHERE status <> 'succeeded'")).rows)
      .toEqual([{ n: 0 }]);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 90000);
