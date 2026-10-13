// HA-M2-382 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): a quote whose expiry time
// has passed no longer opens the request's media, even while its status
// still says 'submitted' because the lapse sweep has not run yet. The
// provider who sent it gets 404 for a link and for the booking listing, as a
// provider with a declined quote does (HA-M2-102); while the quote was live
// the same provider got a link. This is the P3 viewer rule's deliberate
// tightening of merged.md 2.3 ("a provider with a submitted quote"): an
// expired quote is not a live one. Real router, auth, service and
// migrations 183/184 on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA, providerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-382: a provider whose submitted quote is past expires_at gets 404 for the request media', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [id]);
    const quoteId = await submitQuote(database, bookingId, providerA);
    const provider = mediaHttp(providerUserA, 'provider');
    expect((await provider.url(id)).status).toBe(200);

    await database.query(`UPDATE booking_quotes SET created_at = NOW() - INTERVAL '3 days',
        expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [quoteId]);
    expect((await database.query('SELECT status FROM booking_quotes WHERE id = $1', [quoteId])).rows[0].status).toBe('submitted');

    const refused = await provider.url(id);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('not_found');
    expect((await provider.booking(bookingId)).status).toBe(404);
  });
}, 60000);
