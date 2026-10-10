import type { Pool } from 'pg';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, confirmedButReleasedB,
  shortHeldResolvedB, noShowTimingB, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, bookingA, bookingB, escrowWallet, providerUserB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S2-0 supporting checks: each Slice 2 starting state is built through real
// routes and services (or, where stated, one documented UPDATE), and the
// shared escrow wallet holds every booking's money.

async function escrowPending(database: Pool): Promise<number> {
  return Number((await database.query<{ p: string }>('SELECT pending_balance::text AS p FROM wallets WHERE id=$1',
    [escrowWallet])).rows[0]!.p);
}

async function providerBAvailable(database: Pool): Promise<number> {
  return Number((await database.query<{ b: string }>(`SELECT COALESCE(SUM(available_balance),0)::text AS b
    FROM wallets WHERE user_id=$1 AND type='provider'`, [providerUserB])).rows[0]!.b);
}

async function stateOf(database: Pool, bookingId: string) {
  return (await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingId])).rows;
}

it('the bystander booking holds the most, and the shared escrow wallet holds all three bookings', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect(await heldFor(database, bookingA)).toBe(100000);
    expect(await heldFor(database, bookingB)).toBe(1000000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
    expect(await escrowPending(database)).toBe(100000 + 1000000 + bystanderHeld);
    expect((await database.query(`SELECT fixed_by_event FROM booking_financial_terms WHERE booking_id=$1`, [bystanderBooking])).rows)
      .toEqual([{ fixed_by_event: 'wallet_payment_authorized' }]);
  });
}, 60000);

it('a support refund through the real route leaves booking B partly refunded', async () => {
  await withMoneyDisputeDatabase(async database => {
    const response = await supportRefundB(250000, requestKey);

    expect(response.status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(750000);
    expect(await stateOf(database, bookingB)).toEqual([{ status: 'completed_by_provider', escrow_status: 'partially_refunded' }]);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('the confirmed-and-released builder leaves booking B released and the provider paid', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);

    expect(await stateOf(database, bookingB)).toEqual([{ status: 'confirmed', escrow_status: 'released' }]);
    expect(await heldFor(database, bookingB)).toBe(0);
    // Provider B receives the price minus the 15% founding commission.
    expect(await providerBAvailable(database)).toBe(680000);
    expect(await heldFor(database, bookingA)).toBe(100000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('the short-held builder leaves booking B resolved, labelled held, and holding 750,000', async () => {
  await withMoneyDisputeDatabase(async database => {
    await shortHeldResolvedB(database, requestKey);

    expect(await stateOf(database, bookingB)).toEqual([{ status: 'resolved', escrow_status: 'held' }]);
    expect(await heldFor(database, bookingB)).toBe(750000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('the dispute filing and admin decision routes work end to end on a fully held booking', async () => {
  await withMoneyDisputeDatabase(async database => {
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    expect(filed.body.data).toMatchObject({ status: 'open', bookingId: bookingB });

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect(decided.status).toBe(200);
    expect((await database.query('SELECT status, resolution_type FROM disputes')).rows)
      .toEqual([{ status: 'resolved', resolution_type: 'no_refund' }]);
    // No refund: the whole of booking B is released after the decision.
    expect(await stateOf(database, bookingB)).toEqual([{ status: 'resolved', escrow_status: 'released' }]);
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await providerBAvailable(database)).toBe(680000);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM gateway_retry_queue')).rows).toEqual([{ n: 0 }]);
    expect(await heldFor(database, bookingA)).toBe(100000);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);

it('with the no-show timing, a no-show dispute filed over HTTP resolves automatically', async () => {
  await withMoneyDisputeDatabase(async database => {
    await noShowTimingB(database);

    const filed = await fileDisputeHttp()(bookingB, 'no_show');

    expect(filed.status).toBe(201);
    expect(filed.body.data).toMatchObject({ status: 'resolved', autoResolved: true });
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 60000);
