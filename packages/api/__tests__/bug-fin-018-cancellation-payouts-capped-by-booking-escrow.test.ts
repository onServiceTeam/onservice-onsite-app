import { isDeepStrictEqual } from 'node:util';
import { logger } from '../src/utils/logger';
import {
  withMoneyDisputeDatabase, heldFor, shortHeldResolvedB, adminCancelHttp, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, bookingB, requestKey,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Booking B is resolved and labelled "held" but holds only 750,000 of its
// 1,000,000 (a support refund of 250,000 came first). Both cancellations
// below would move the whole 1,000,000: the provider's 800,000 compensation
// plus the 200,000 fee, kept by the platform on a customer no-show or
// refunded to the customer at 0 hours (the fixture's 0% bracket). Both cases
// always run, so each is seen failing or passing on its own.
it('Bug FIN-018 - an admin cancel cannot pay out more than the booking still holds in escrow', async () => {
  const outcomes: unknown[] = [];
  for (const moneyInputs of [{ customerNoShow: true }, { hoursUntilScheduled: 0 }]) {
    await withMoneyDisputeDatabase(async database => {
      await shortHeldResolvedB(database, requestKey);
      (logger.error as jest.Mock).mockClear();
      const before = await participantSnapshot(database);

      const response = await adminCancelHttp()(bookingB, moneyInputs);

      outcomes.push({
        moneyInputs,
        status: response.status,
        error: response.body.error,
        unchanged: isDeepStrictEqual(await participantSnapshot(database), before),
        heldB: await heldFor(database, bookingB),
        heldBystander: await heldFor(database, bystanderBooking),
        refusalLogs: (logger.error as jest.Mock).mock.calls
          .filter(([message]) => message === 'Escrow payout refused for operations review')
          .map(([, details]) => details),
      });
    });
  }

  // Before S2-1 both answered 200 and paid out 1,000,000 for a booking that
  // held 750,000, taking 250,000 of other bookings' escrow.
  const refused = (moneyInputs: Record<string, unknown>) => ({
    moneyInputs,
    status: 409,
    error: {
      statusCode: 409,
      code: 'CANCELLATION_ESCROW_MISMATCH',
      message: "This booking holds ₱7,500.00 in escrow, not its full ₱10,000.00 (escrow label: held). Nothing was cancelled or paid. Do not change its status; ask finance to review this booking's payments first.",
    },
    unchanged: true,
    heldB: 750000,
    heldBystander: bystanderHeld,
    refusalLogs: [{
      code: 'CANCELLATION_ESCROW_MISMATCH', bookingId: bookingB, heldCentavos: 750000, totalCentavos: 1000000, escrowStatus: 'held',
    }],
  });
  expect(outcomes).toEqual([refused({ customerNoShow: true }), refused({ hoursUntilScheduled: 0 })]);
}, 120000);
