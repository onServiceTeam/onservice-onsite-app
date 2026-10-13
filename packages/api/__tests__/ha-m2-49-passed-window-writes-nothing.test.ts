// HA-M2-49 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// escalation E83): a quote whose window can no longer start in time is
// refused at acceptance with 409 QUOTE_SLOT_PASSED before anything is
// written: the booking, the quotes and the financial terms are exactly as
// they were. The quote here is still unexpired but offered yesterday evening
// (a lead-time setting raised after the quote was sent can produce this).
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, insertQuote, customerA, providerA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-49: a passed window gives 409 and writes nothing to the booking, quotes or terms', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted' });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA, earliestDayOffset: -1, window: 'evening' });
    const snapshot = async () => ({
      booking: (await database.query('SELECT * FROM bookings WHERE id = $1', [bookingId])).rows,
      quotes: (await database.query('SELECT * FROM booking_quotes WHERE booking_id = $1 ORDER BY id', [bookingId])).rows,
      terms: (await database.query('SELECT COUNT(*)::int AS n FROM booking_financial_terms WHERE booking_id = $1', [bookingId])).rows,
    });
    const before = await snapshot();

    const response = await flowHttp(customerA, 'customer').accept(bookingId, quoteId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('QUOTE_SLOT_PASSED');
    expect(await snapshot()).toEqual(before);
    expect(before.terms).toEqual([{ n: 0 }]);
  });
}, 90000);
