// HA-M2-102 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 27): a provider's signed link keeps checking the viewer
// rule. While the provider holds a live quote the link streams; once the
// customer declines that quote the cached decision may still serve it for up
// to the 60-second cache window, and after that window the same, unexpired
// link gets 403, as does minting a new one (404). Real router, auth, service
// and migrations 183/184 on the guarded PostgreSQL fixture; the clock is
// moved forward with Date.now only (the database clock is real).
import { bookingIntegrationIt as it, customerA, providerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, declineQuote, fetchSigned, mediaHttp, submitQuote, syntheticJpeg,
  uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-102: a provider token stops streaming within the cache window once their quote is declined', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [id]);
    const quoteId = await submitQuote(database, bookingId, providerA);

    const provider = mediaHttp(providerUserA, 'provider');
    const minted = await provider.url(id);
    expect(minted.status).toBe(200);
    const link = minted.body.data.url as string;
    expect((await fetchSigned(link)).status).toBe(200);

    await declineQuote(database, quoteId);
    // Inside the cache window the earlier decision may still be used.
    expect((await fetchSigned(link)).status).toBe(200);
    // A fresh mint is never cached: the declined provider is refused at once.
    expect((await provider.url(id)).status).toBe(404);

    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);
    try {
      const afterWindow = await fetchSigned(link);
      expect(afterWindow.status).toBe(403);
      expect((afterWindow.body as Buffer).toString()).not.toContain('JFIF');
    } finally {
      clock.mockRestore();
    }
  });
}, 60000);
