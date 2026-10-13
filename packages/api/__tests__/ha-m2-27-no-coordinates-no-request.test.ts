// HA-M2-27 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// a provider with no map location is neither notified of a request nor
// admitted to quote on it. Before D38 such a provider matched every request in
// their category; with first-response exclusivity they could lock a request
// they cannot reach. Real HTTP (job request with its background fan-out, then
// a quote) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, invitesOf, waitUntil, customerA, providerA, providerB, providerUserB,
} from './helpers/request-flow-postgres';
import { jobRequestBody, quoteService } from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-27: a provider without coordinates is neither notified nor admitted', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query('UPDATE providers SET latitude = NULL, longitude = NULL WHERE id = $1', [providerB]);

    const created = await flowHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: quoteService }));
    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as string;
    await waitUntil(async () => (await invitesOf(database, bookingId)).length > 0, 'the fan-out');
    await new Promise(resolve => setTimeout(resolve, 200));
    expect((await invitesOf(database, bookingId)).map(i => i.provider_id)).toEqual([providerA]);
    expect((await database.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1`, [providerUserB])).rows[0].n).toBe(0);

    const quote = await flowHttp(providerUserB, 'provider').quote(bookingId);

    expect(quote.status).toBe(403);
    expect(quote.body.error.message).toBe('This request is outside your active services or service radius.');
    expect((await database.query('SELECT COUNT(*)::int AS n FROM booking_quotes WHERE booking_id = $1', [bookingId])).rows[0].n).toBe(0);
  });
}, 90000);
