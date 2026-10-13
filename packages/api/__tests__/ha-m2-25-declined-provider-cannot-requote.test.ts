// HA-M2-25 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// after the customer declines provider A's quote, the request reopens for
// other providers, but A can neither see it in their Requests list nor quote
// on it again (409 QUOTE_ALREADY_SUBMITTED). One quote per provider per
// request, whatever became of it. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-25: a declined provider cannot quote again after the reopen', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const provider = flowHttp(providerUserA, 'provider');
    const first = await provider.quote(bookingId);
    expect(first.status).toBe(201);
    const declined = await flowHttp(customerA, 'customer').decline(bookingId, first.body.data.id, { reason: 'timing' });
    expect(declined.body.data).toMatchObject({ bookingStatus: 'requested', round: 2, reopened: true });

    const again = await provider.quote(bookingId, { quotedPrice: 60000, description: 'Lower price, same work, any day you like.', earliestDate: first.body.data.earliest_date, earliestTimeWindow: 'afternoon' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('QUOTE_ALREADY_SUBMITTED');
    expect((await provider.leads()).body.total).toBe(0);
    expect((await database.query(`SELECT status FROM booking_quotes WHERE booking_id = $1 AND provider_id = $2`,
      [bookingId, providerA])).rows).toEqual([{ status: 'declined' }]);
  });
}, 90000);
