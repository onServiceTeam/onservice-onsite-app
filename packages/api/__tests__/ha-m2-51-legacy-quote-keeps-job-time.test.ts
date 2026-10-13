// HA-M2-51 (customer human audit 2026-10-13, D38 Milestone 2, package P2): a
// quote sent before D38 has no earliest date or window. Accepting it keeps
// the booking's job time when that time is still at least the lead time away
// (here three days), and stores no window. Real HTTP on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, insertQuote, customerA, providerA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-51: a legacy quote with no slot keeps scheduled_at', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', scheduledAtSql: "date_trunc('second', NOW()) + INTERVAL '3 days'" });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA, earliestDayOffset: null });
    const before = (await database.query('SELECT scheduled_at FROM bookings WHERE id = $1', [bookingId])).rows[0].scheduled_at as Date;

    const accepted = await flowHttp(customerA, 'customer').accept(bookingId, quoteId);

    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ scheduledAt: before.toISOString(), scheduledWindow: null });
    expect((await database.query('SELECT scheduled_at, scheduled_window, status FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ scheduled_at: before, scheduled_window: null, status: 'payment_pending' }]);
  });
}, 90000);
