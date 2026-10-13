// HA-M2-45 (customer human audit 2026-10-13, D38 Milestone 2, package P2): a
// provider's quote links their invite: the invite becomes 'quoted' with the
// quote's id and a response time, so the back office can measure time to
// first response. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, invitesOf, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-45: a quote links its invite', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status)
      VALUES ($1, $2, 1, 'push', 'sent')`, [bookingId, providerA]);

    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);

    expect(quote.status).toBe(201);
    expect(await invitesOf(database, bookingId)).toEqual([{
      provider_id: providerA, round: 1, source: 'push', status: 'quoted', rank: null,
      quote_id: quote.body.data.id, viewed: false, responded: true, closed: false,
    }]);
  });
}, 90000);
