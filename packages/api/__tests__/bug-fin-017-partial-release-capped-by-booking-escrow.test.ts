import type { Pool } from 'pg';
import * as escrowService from '../src/services/escrow.service';
import { enqueueRetry, processRetries } from '../src/services/gateway-retry.service';
import { logger } from '../src/utils/logger';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, snapshot, bookingB, requestKey } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const refusal = (release: string) =>
  `This release of ${release} does not match the ₱3,000.00 this booking still holds in escrow. Nothing was paid. Ask finance to review this booking's payments before releasing or refunding it.`;

async function partialReleaseRows(database: Pool) {
  return (await database.query(`SELECT amount_centavos::text AS amount, status, attempts, last_error
      FROM gateway_retry_queue WHERE action_type='release_partial_escrow' ORDER BY created_at, id`)).rows;
}

// Every refused release is logged at error level with its amounts.
function releaseRefusalLogs() {
  return (logger.error as jest.Mock).mock.calls
    .filter(([message]) => message === 'Escrow payout refused for operations review')
    .map(([, details]) => details);
}

async function escrowLabel(database: Pool): Promise<string> {
  return (await database.query('SELECT escrow_status FROM bookings WHERE id=$1', [bookingB])).rows[0]!.escrow_status;
}

it('Bug FIN-017 - a queued partial release pays out exactly what the booking still holds, or nothing', async () => {
  await withMoneyDisputeDatabase(async database => {
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    // A 60% decision refunds 600,000. Its partial release of the other
    // 400,000 fails once after commit, so the decision queues it for retry.
    const outage = jest.spyOn(escrowService, 'releasePartialEscrow')
      .mockRejectedValueOnce(new Error('Synthetic release outage'));
    try {
      const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'partial_refund', refundPercent: 60 });
      expect(decided.status).toBe(200);
    } finally {
      outage.mockRestore();
    }
    expect(await heldFor(database, bookingB)).toBe(400000);
    expect((await partialReleaseRows(database)).map(row => [row.amount, row.status])).toEqual([['400000', 'pending']]);

    // Support then refunds 100,000 more, so booking B holds only 300,000.
    expect((await supportRefundB(100000, requestKey)).status).toBe(200);
    expect(await heldFor(database, bookingB)).toBe(300000);
    const before = await snapshot(database);

    await processRetries();

    // Before S2-1 the worker paid out the queued 400,000: 100,000 more than
    // booking B held, taken from the other bookings' escrow.
    expect(await snapshot(database)).toEqual(before);
    let rows = await partialReleaseRows(database);
    expect(rows[0]).toEqual({ amount: '400000', status: 'pending', attempts: 1, last_error: refusal('₱4,000.00') });

    // A queued release smaller than what is held is refused too: paying it
    // would mark the escrow released and strand the other 100,000.
    await enqueueRetry({
      actionType: 'release_partial_escrow', bookingId: bookingB, amountCentavos: 200000,
      initialError: 'Synthetic queued release',
    });
    await processRetries();

    expect(await snapshot(database)).toEqual(before);
    rows = await partialReleaseRows(database);
    expect(rows[1]).toEqual({ amount: '200000', status: 'pending', attempts: 1, last_error: refusal('₱2,000.00') });
    expect(await escrowLabel(database)).toBe('partially_refunded');
    expect(releaseRefusalLogs()).toEqual([
      { code: 'ESCROW_RELEASE_AMOUNT_MISMATCH', bookingId: bookingB, releaseCentavos: 400000, heldCentavos: 300000 },
      { code: 'ESCROW_RELEASE_AMOUNT_MISMATCH', bookingId: bookingB, releaseCentavos: 200000, heldCentavos: 300000 },
    ]);

    // A queued release of exactly what is held is paid out, and only that.
    await enqueueRetry({
      actionType: 'release_partial_escrow', bookingId: bookingB, amountCentavos: 300000,
      initialError: 'Synthetic queued release',
    });
    await processRetries();

    rows = await partialReleaseRows(database);
    expect(rows[2]).toMatchObject({ amount: '300000', status: 'succeeded' });
    expect(await heldFor(database, bookingB)).toBe(0);
    expect(await escrowLabel(database)).toBe('released');
    expect(await heldFor(database, bystanderBooking)).toBe(bystanderHeld);
  });
}, 90000);
