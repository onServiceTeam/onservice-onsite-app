// HA-M2-299 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique M4): in compare mode (request_max_open_quotes 5), declining one of
// two live quotes is not a declined round. The request stays 'quoted' in
// round 1 with no declined round counted, and nothing is sent to other
// providers (the request simply reappears in their lists while it is under
// the cap). Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, addProvider, invitesOf, notificationsOf, quoteBody,
  upsertPlatformSetting, customerA, providerC, providerUserA, providerUserB, providerUserC,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-299: a compare-mode decline with live quotes left keeps the round and declined_rounds', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database);
    const quoteA = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;
    await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody({ quotedPrice: 90000 }));

    const response = await flowHttp(customerA, 'customer').decline(bookingId, quoteA, { reason: 'too_expensive' });

    expect(response.body.data).toMatchObject({ bookingStatus: 'quoted', round: 1, reopened: false, opsReview: false });
    expect((await database.query(`SELECT status, request_round, request_declined_rounds FROM bookings WHERE id = $1`,
      [bookingId])).rows).toEqual([{ status: 'quoted', request_round: 1, request_declined_rounds: 0 }]);
    expect((await invitesOf(database, bookingId)).some(i => i.round !== 1)).toBe(false);
    expect((await notificationsOf(database, providerUserC)).filter(n => n.type === 'job_request_reopened')).toEqual([]);
  });
}, 90000);
