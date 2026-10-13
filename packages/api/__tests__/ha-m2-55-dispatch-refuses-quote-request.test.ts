// HA-M2-55 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// merged plan bad news 8): the fixed-price offer cycle cannot be started on a
// quote request. POST /bookings/:id/dispatch answers 409
// QUOTE_REQUEST_NOT_DISPATCHABLE and no offer is created. The guard is in the
// route; the offer service is unchanged (E33). Real HTTP on the guarded
// PostgreSQL fixture, with the real booking_offers table (migration 125).
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-55: /dispatch refuses a quote request', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const response = await flowHttp(customerA, 'customer').dispatch(bookingId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('QUOTE_REQUEST_NOT_DISPATCHABLE');
    expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_offers WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
    expect((await database.query('SELECT status, provider_id FROM bookings WHERE id = $1', [bookingId])).rows)
      .toEqual([{ status: 'requested', provider_id: null }]);
  });
}, 90000);
