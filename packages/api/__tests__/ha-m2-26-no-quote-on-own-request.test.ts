// HA-M2-26 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// a provider can never quote on a request they posted themselves. The request
// row here belongs to provider A's own user account (a request stored before
// Milestone 1 made job requests customer-only); A's quote is refused with 403
// and nothing is stored, and the request is not in A's list. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-26: a provider cannot quote their own request', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { customerId: providerUserA });
    const provider = flowHttp(providerUserA, 'provider');

    const response = await provider.quote(bookingId);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('You cannot send a quote for your own request.');
    expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
    expect((await provider.leads()).body.total).toBe(0);
  });
}, 90000);
