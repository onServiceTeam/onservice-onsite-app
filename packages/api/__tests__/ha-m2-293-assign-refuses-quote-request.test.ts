// HA-M2-293 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M1): a customer cannot get around the quote flow by assigning a
// provider straight onto their quote request. POST /bookings/:id/assign
// answers 409 QUOTE_REQUEST_NOT_ASSIGNABLE ("Choose a quote from a pro.") and
// nothing is written: before this guard the booking became 'matched' at a 0
// price and the provider got the exact address. Real HTTP on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, notificationsOf, customerA, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-293: a customer\'s /assign on a quote request gets 409 and writes nothing', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const snapshot = async () => ({
      booking: (await database.query('SELECT * FROM bookings WHERE id = $1', [bookingId])).rows,
      terms: (await database.query('SELECT COUNT(*)::int AS n FROM booking_financial_terms WHERE booking_id = $1', [bookingId])).rows,
    });
    const before = await snapshot();

    const response = await flowHttp(customerA, 'customer').assign(bookingId, providerA);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'QUOTE_REQUEST_NOT_ASSIGNABLE', message: 'Choose a quote from a pro.' });
    expect(await snapshot()).toEqual(before);
    expect(await notificationsOf(database, providerUserA)).toEqual([]);
  });
}, 90000);
