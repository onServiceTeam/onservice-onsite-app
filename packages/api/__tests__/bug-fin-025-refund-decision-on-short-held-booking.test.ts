import { isDeepStrictEqual } from 'node:util';
import { logger } from '../src/utils/logger';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, fileDisputeHttp, adminResolveHttp, bystanderBooking, bystanderHeld,
  decisionSnapshot, decisionRefusalLog,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB, requestKey } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Booking B holds 750,000 of 1,000,000 but is labelled "held" (LAUNCH-
// LIMITATIONS 121). A "50%" decision used to refund 500,000, which the
// booking's own cap allowed, and record the dispute as resolved. The
// provider's 500,000 share was then refused, because only 250,000 was left,
// and queued for a retry that can never succeed: the customer had 750,000
// back in all and the rest was stuck. Now the decision is refused first.
it('Bug FIN-025 - a refund decision on a booking labelled held but holding less than its total is refused', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    await database.query("UPDATE bookings SET escrow_status='held' WHERE id=$1", [bookingB]);
    const before = await decisionSnapshot(database);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'partial_refund', refundPercent: 50 });

    expect({
      status: decided.status,
      error: decided.body.error,
      unchanged: isDeepStrictEqual(await decisionSnapshot(database), before),
      dispute: (await database.query('SELECT status FROM disputes WHERE booking_id=$1', [bookingB])).rows,
      heldB: await heldFor(database, bookingB),
      heldBystander: await heldFor(database, bystanderBooking),
      // The support refund's own payment step already succeeded; nothing else
      // may be queued.
      retryRows: (await database.query("SELECT action_type, status FROM gateway_retry_queue WHERE status <> 'succeeded'")).rows,
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
      heldBystander: bystanderHeld,
      retryRows: [],
      logged: [{
        code: 'DISPUTE_ESCROW_MISMATCH', disputeId: filed.body.data.id, bookingId: bookingB,
        resolutionType: 'partial_refund', refundCentavos: 500000, heldCentavos: 750000, totalCentavos: 1000000,
        escrowStatus: 'held',
      }],
    });
  });
}, 60000);
