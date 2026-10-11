import { isDeepStrictEqual } from 'node:util';
import { logger } from '../src/utils/logger';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, decisionSnapshot, decisionRefusalLog,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB, requestKey } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Booking B holds 750,000 of 1,000,000 but is labelled "held", the state older
// code left behind (LAUNCH-LIMITATIONS 121). A "no refund" decision used to be
// recorded as resolved, and the release after it was refused (the release
// requires a "held" booking to hold its whole total). Now the decision is
// refused before anything is recorded, and logged at error for support.
it('Bug FIN-023 - a no-refund decision on a booking labelled held but holding less than its total is refused', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]);
    const before = await decisionSnapshot(database);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect({
      status: decided.status,
      error: decided.body.error,
      unchanged: isDeepStrictEqual(await decisionSnapshot(database), before),
      dispute: (await database.query('SELECT status FROM disputes WHERE booking_id=$1', [bookingB])).rows,
      heldB: await heldFor(database, bookingB),
      // The support refund's own payment step already succeeded; nothing else
      // may be queued.
      retryRows: (await database.query("SELECT COUNT(*)::int AS n FROM gateway_retry_queue WHERE status <> 'succeeded'")).rows,
      logged: (logger.error as jest.Mock).mock.calls.filter(([message]) => message === decisionRefusalLog).map(([, details]) => details),
    }).toEqual({
      status: 409,
      error: {
        statusCode: 409,
        code: 'DISPUTE_ESCROW_MISMATCH',
        message: 'This booking\'s escrow does not add up: it holds ₱7,500.00 of its ₱10,000.00 total, but its escrow label is "held". Nothing was recorded or moved; ask finance to review this booking\'s payments first.',
      },
      unchanged: true,
      dispute: [{ status: 'open' }],
      heldB: 750000,
      retryRows: [{ n: 0 }],
      logged: [{
        code: 'DISPUTE_ESCROW_MISMATCH', disputeId: filed.body.data.id, bookingId: bookingB,
        resolutionType: 'no_refund', refundCentavos: 0, heldCentavos: 750000, totalCentavos: 1000000,
        escrowStatus: 'held',
      }],
    });
  });
}, 60000);
