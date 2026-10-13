// HA-M2-101 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 26): a provider who can currently see the request as a
// lead (in category, inside their radius, no quote yet) gets a signed link
// to its photo, and the link streams the file. A provider who cannot see the
// lead (no services, no coordinates) gets 404, as does the booking listing.
// Real router, auth, service, jobLeadsService.getOpenJobRequestForProvider
// and migrations 183/184 on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA, providerUserA, providerUserB } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, fetchSigned, mediaHttp, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-101: a provider who can see the lead gets a URL, one who cannot gets 404', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const { id } = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [id]);

    const leadProvider = mediaHttp(providerUserA, 'provider');
    const minted = await leadProvider.url(id);
    expect(minted.status).toBe(200);
    expect(minted.body.data).toMatchObject({ kind: 'photo', mime: 'image/jpeg' });
    expect(minted.body.data.url).toMatch(/^\/api\/v1\/job-media\/file\/[^/.]+\.[^/.]+\.\d+\.[0-9a-f]{64}$/);
    const stored = (await database.query('SELECT size_bytes FROM job_media WHERE id = $1', [id])).rows[0].size_bytes;
    const streamed = await fetchSigned(minted.body.data.url);
    expect(streamed.status).toBe(200);
    expect((streamed.body as Buffer).length).toBe(stored);
    expect((await leadProvider.booking(bookingId)).body.data.items.map((item: { id: string }) => item.id)).toEqual([id]);

    const outsider = mediaHttp(providerUserB, 'provider');
    const refused = await outsider.url(id);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('not_found');
    expect((await outsider.booking(bookingId)).status).toBe(404);
  });
}, 60000);
