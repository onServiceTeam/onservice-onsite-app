// HA-M2-383 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): a live quote opens the
// request's media only while the provider who sent it is approved. Once the
// provider is suspended, their still-submitted, unexpired quote gives 404
// for a link and for the booking listing; while they were approved the same
// quote gave a link. This is the P3 viewer rule's deliberate tightening of
// merged.md 2.3: a suspended provider cannot act on the request, so it
// should not keep seeing the customer's private media. Real router, auth,
// service and migrations 183/184 on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA, providerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-383: a suspended provider with a live quote gets 404 for the request media', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [id]);
    await submitQuote(database, bookingId, providerA);
    const provider = mediaHttp(providerUserA, 'provider');
    expect((await provider.url(id)).status).toBe(200);

    await database.query("UPDATE providers SET status = 'suspended' WHERE id = $1", [providerA]);

    const refused = await provider.url(id);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('not_found');
    expect((await provider.booking(bookingId)).status).toBe(404);
  });
}, 60000);
