// HA-M2-44 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// opening a request's detail records that the provider saw it: a pushed
// invite becomes 'viewed' with a viewed time, and a provider who found the
// request in their list without an invite gets an 'inbox' invite, already
// viewed. That record feeds the unseen badge and the admin insights. Real HTTP
// through the mounted provider routes on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, invitesOf, providerA, providerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-44: opening the detail marks the invite viewed or creates a viewed inbox invite', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status)
      VALUES ($1, $2, 1, 'push', 'sent')`, [bookingId, providerA]);

    expect((await flowHttp(providerUserA, 'provider').lead(bookingId)).status).toBe(200);
    expect((await flowHttp(providerUserB, 'provider').lead(bookingId)).status).toBe(200);

    expect((await invitesOf(database, bookingId)).map(i => [i.provider_id, i.round, i.source, i.status, i.viewed]))
      .toEqual([
        [providerA, 1, 'push', 'viewed', true],
        [providerB, 1, 'inbox', 'viewed', true],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
  });
}, 90000);
