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

// Support refunded 250,000, so booking B holds 750,000 of its 1,000,000. A
// "60%" decision used to refund 60% of the original 1,000,000 on top: the
// customer got 850,000 back in all, and the provider's 400,000 release was
// then refused and left stuck. What 60% should mean after an earlier refund
// is Ken's decision (D36 Q1); until then the decision is held back.
it('Bug FIN-022 - a partial dispute decision after an earlier refund is held back and moves nothing', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    const before = await decisionSnapshot(database);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'partial_refund', refundPercent: 60 });

    expect({
      status: decided.status,
      error: decided.body.error,
      unchanged: isDeepStrictEqual(await decisionSnapshot(database), before),
      dispute: (await database.query('SELECT status FROM disputes WHERE booking_id=$1', [bookingB])).rows,
      heldB: await heldFor(database, bookingB),
      heldBystander: await heldFor(database, bystanderBooking),
      // The support refund's own payment step already succeeded; nothing else
      // may be queued (before the fix, the provider's share was).
      retryRows: (await database.query("SELECT action_type, status FROM gateway_retry_queue WHERE status <> 'succeeded'")).rows,
      logged: (logger.warn as jest.Mock).mock.calls.filter(([message]) => message === decisionRefusalLog).map(([, details]) => details),
    }).toEqual({
      status: 409,
      error: {
        statusCode: 409,
        code: 'DISPUTE_DECISION_AFTER_EARLIER_REFUND',
        message: 'This booking was already partly refunded: it holds ₱7,500.00 of its ₱10,000.00 total. A refund decision after an earlier refund is on hold until the owner decides how to count it. Nothing was recorded or moved; leave the dispute open until then.',
      },
      unchanged: true,
      dispute: [{ status: 'open' }],
      heldB: 750000,
      heldBystander: bystanderHeld,
      retryRows: [],
      logged: [{
        code: 'DISPUTE_DECISION_AFTER_EARLIER_REFUND', disputeId: filed.body.data.id, bookingId: bookingB,
        resolutionType: 'partial_refund', refundCentavos: 600000, heldCentavos: 750000, totalCentavos: 1000000,
        escrowStatus: 'partially_refunded',
      }],
    });
  });
}, 60000);
