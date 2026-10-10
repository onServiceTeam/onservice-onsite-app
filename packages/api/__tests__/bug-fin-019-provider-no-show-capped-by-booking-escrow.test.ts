import { isDeepStrictEqual } from 'node:util';
import { logger } from '../src/utils/logger';
import {
  withMoneyDisputeDatabase, heldFor, supportRefundB, reportNoShowHttp, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, bookingB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug FIN-019 - a provider no-show report cannot pay out more than the booking still holds in escrow', async () => {
  await withMoneyDisputeDatabase(async database => {
    expect((await supportRefundB(250000, requestKey)).status).toBe(200);
    // The label older code could leave, on an arrived booking past the
    // default 30-minute wait: "held", but holding 750,000 of 1,000,000.
    await database.query(`UPDATE bookings SET status='provider_arrived', escrow_status='held',
        scheduled_at=NOW() - INTERVAL '60 minutes' WHERE id=$1`, [bookingB]);
    (logger.error as jest.Mock).mockClear();
    const before = await participantSnapshot(database);

    const response = await reportNoShowHttp()(bookingB);

    // The whole outcome is reported at once, so a failure shows the money
    // too. Before S2-1 the report answered 200 and paid out 1,000,000
    // (800,000 to the provider, the 200,000 fee to the platform) for a
    // booking holding 750,000.
    expect({
      status: response.status,
      error: response.body.error,
      unchanged: isDeepStrictEqual(await participantSnapshot(database), before),
      heldB: await heldFor(database, bookingB),
      heldBystander: await heldFor(database, bystanderBooking),
      refusalLogs: (logger.error as jest.Mock).mock.calls
        .filter(([message]) => message === 'Escrow payout refused for operations review')
        .map(([, details]) => details),
    }).toEqual({
      status: 409,
      error: {
        statusCode: 409,
        code: 'CANCELLATION_ESCROW_MISMATCH',
        message: "This booking's payment needs a check by our support team before the no-show can be recorded. Please contact support.",
      },
      unchanged: true,
      heldB: 750000,
      heldBystander: bystanderHeld,
      refusalLogs: [{
        code: 'CANCELLATION_ESCROW_MISMATCH', bookingId: bookingB, heldCentavos: 750000, totalCentavos: 1000000, escrowStatus: 'held',
      }],
    });
  });
}, 60000);
