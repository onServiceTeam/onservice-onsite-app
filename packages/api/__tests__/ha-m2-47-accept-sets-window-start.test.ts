// HA-M2-47 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// escalation E83 interim default): accepting a quote whose window starts
// later than now plus the lead time sets the job time to the window's start
// in Manila time (morning, two days out: 08:00 +08:00) and stores the window
// next to it. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-47: accept sets the Manila window start and scheduled_window', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const earliestDate = platformDate(2);
    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({ earliestDate, earliestTimeWindow: 'morning' }));

    const accepted = await flowHttp(customerA, 'customer').accept(bookingId, quote.body.data.id);

    const windowStart = new Date(`${earliestDate}T08:00:00+08:00`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ scheduledAt: windowStart.toISOString(), scheduledWindow: 'morning' });
    expect((await database.query('SELECT scheduled_at, scheduled_window FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ scheduled_at: windowStart, scheduled_window: 'morning' }]);
  });
}, 90000);
