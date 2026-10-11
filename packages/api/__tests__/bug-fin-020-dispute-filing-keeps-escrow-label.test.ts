import type { Pool } from 'pg';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, confirmedButReleasedB, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB, requestKey } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function bookingState(database: Pool) {
  return (await database.query<{ status: string; escrow_status: string }>(
    'SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows[0];
}

// Two real states whose money already moved: a support refund left booking B
// partly refunded (holding 750,000), or a manual release paid it out
// (holding nothing). Both cases always run and report.
it('Bug FIN-020 - filing a dispute keeps the escrow label of money already refunded or released', async () => {
  const outcomes: unknown[] = [];
  const states: Array<[string, (database: Pool) => Promise<void>]> = [
    ['partly refunded', async () => { expect((await supportRefundB(250000, requestKey)).status).toBe(200); }],
    ['released', confirmedButReleasedB],
  ];
  for (const [name, arrange] of states) {
    await withMoneyDisputeDatabase(async database => {
      await arrange(database);
      const before = { ...(await bookingState(database))!, held: await heldFor(database, bookingB) };

      const filed = await fileDisputeHttp()(bookingB);

      outcomes.push({
        name,
        filed: filed.status,
        dispute: filed.body.data?.status,
        // Before S2-2 the filing relabelled both as "held".
        label: (await bookingState(database))!.escrow_status,
        labelBefore: before.escrow_status,
        heldUnchanged: await heldFor(database, bookingB) === before.held,
        heldBystander: await heldFor(database, bystanderBooking),
      });
    });
  }
  expect(outcomes).toEqual([
    { name: 'partly refunded', filed: 201, dispute: 'open', label: 'partially_refunded', labelBefore: 'partially_refunded', heldUnchanged: true, heldBystander: bystanderHeld },
    { name: 'released', filed: 201, dispute: 'open', label: 'released', labelBefore: 'released', heldUnchanged: true, heldBystander: bystanderHeld },
  ]);
}, 120000);
