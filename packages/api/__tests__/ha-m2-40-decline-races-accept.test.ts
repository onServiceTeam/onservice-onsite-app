// HA-M2-40 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// a decline and an accept of the same quote sent at the same moment cannot
// both win. Both lock the request row FOR UPDATE, so one commits and the
// other finds the quote already resolved. The result is either a declined
// quote on a reopened request with no price terms, or an accepted quote on a
// payment_pending booking with one terms row, never a mix. Real concurrent
// HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-40: a decline racing an accept on the same quote: exactly one wins', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id as string;
    const customer = flowHttp(customerA, 'customer');

    const [decline, accept] = await Promise.all([
      customer.decline(bookingId, quoteId, { reason: 'too_expensive' }),
      customer.accept(bookingId, quoteId),
    ]);

    expect([decline.status, accept.status].filter(status => status === 200)).toHaveLength(1);
    const state = (await database.query(`SELECT q.status AS quote_status, b.status AS booking_status,
        (SELECT COUNT(*)::int FROM booking_financial_terms t WHERE t.booking_id = b.id) AS terms
      FROM booking_quotes q JOIN bookings b ON b.id = q.booking_id WHERE q.id = $1`, [quoteId])).rows[0];
    if (decline.status === 200) {
      expect([404, 409]).toContain(accept.status);
      expect(state).toEqual({ quote_status: 'declined', booking_status: 'requested', terms: 0 });
    } else {
      expect([404, 409]).toContain(decline.status);
      expect(state).toEqual({ quote_status: 'accepted', booking_status: 'payment_pending', terms: 1 });
    }
  });
}, 90000);
