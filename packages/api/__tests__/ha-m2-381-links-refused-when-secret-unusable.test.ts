// HA-M2-381 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): private media links fail
// closed when DATA_EXPORT_DOWNLOAD_SECRET is unusable (too short, or a
// placeholder value): minting a link (GET /:id/url), the booking listing
// (GET /booking/:id) and reading a link minted earlier (GET /file/:token)
// all answer 503 media_links_unavailable, and no link is handed out.
// design-media.md section 1 (as project.service does). Real router, auth,
// service, boot-guard check and migrations 183/184 on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, fetchSigned, mediaHttp, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-381: link minting, the booking listing and link reads give 503 when the signing secret is unusable', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [id]);
    const earlier = await customer.url(id);
    expect(earlier.status).toBe(200);

    for (const unusable of ['too-short-secret', 'change-me-placeholder-value-for-the-export-secret']) {
      process.env.DATA_EXPORT_DOWNLOAD_SECRET = unusable;
      const minted = await customer.url(id);
      expect(minted.status).toBe(503);
      expect(minted.body.error.code).toBe('media_links_unavailable');
      expect(minted.body.data).toBeUndefined();

      const listing = await customer.booking(bookingId);
      expect(listing.status).toBe(503);
      expect(listing.body.error.code).toBe('media_links_unavailable');

      const read = await fetchSigned(earlier.body.data.url);
      expect(read.status).toBe(503);
      expect(JSON.parse((read.body as Buffer).toString('utf8')).error.code).toBe('media_links_unavailable');
    }
  });
}, 60000);
