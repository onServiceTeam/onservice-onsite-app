// HA-M2-23 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// once a request reaches request_max_open_quotes (1), it leaves every other
// provider's Requests list straight away, and an invited provider who opens
// its detail gets 409 REQUEST_TAKEN (not a bare 404). Real HTTP through the
// mounted provider routes on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-23: at the cap the request leaves other lists, and its detail is 409 for an invited provider', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status)
      VALUES ($1, $2, 1, 'push', 'sent')`, [bookingId, providerB]);
    const providerBHttp = flowHttp(providerUserB, 'provider');
    expect((await providerBHttp.leads()).body.total).toBe(1);

    expect((await flowHttp(providerUserA, 'provider').quote(bookingId)).status).toBe(201);

    const list = await providerBHttp.leads();
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
    expect(list.body.requests).toEqual([]);
    const detail = await providerBHttp.lead(bookingId);
    expect(detail.status).toBe(409);
    expect(detail.body.error.code).toBe('REQUEST_TAKEN');
  });
}, 90000);
