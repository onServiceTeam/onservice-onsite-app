// Bug LINK-133: a quote request must stay discoverable to other eligible
// providers after its first quote.
//
// D38 Milestone 2 (package P2) rewrite. D38 made the number of providers who
// may hold a live quote an admin setting, request_max_open_quotes (default 1,
// first come first served). LINK-133 still holds whenever that setting is
// above 1 (the brief's compare mode, 5), which is what this test pins: after
// provider A's quote, provider B still finds the request in their Requests
// list. The default of 1 is covered by HA-M2-20 and HA-M2-23. Before this
// rewrite the test mocked every SQL call; it now runs the real list query
// over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, upsertPlatformSetting, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug LINK-133 — a quote request remains discoverable to other eligible providers after its first quote', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    const bookingId = await insertQuoteRequest(database);
    expect((await flowHttp(providerUserA, 'provider').quote(bookingId)).status).toBe(201);
    expect((await database.query('SELECT status FROM bookings WHERE id = $1', [bookingId])).rows[0].status).toBe('quoted');

    const list = await flowHttp(providerUserB, 'provider').leads();

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.requests.map((r: { id: string }) => r.id)).toEqual([bookingId]);
    expect(list.body.requests[0]).toMatchObject({ categoryName: 'Aircon Services', serviceName: 'Aircon repair' });
  });
}, 90000);
