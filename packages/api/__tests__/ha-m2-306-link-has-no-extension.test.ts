// HA-M2-306 (customer human audit 2026-10-13, D38 Milestone 2, package P3,
// critique H3): signed media links end in the token, never in a file
// extension, because the live nginx sends any /api/ URL ending in .jpg, .png
// or .webp to its static-file location (404) on the web app and admin hosts.
// The file name goes in Content-Disposition instead: inline;
// filename="request-media.<ext>" with the stored type. Checked for a photo
// (single link and booking listing) and a video. Real router, auth, service
// and storage on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createQuoteRequest, fetchSigned, mediaHttp, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const NO_EXTENSION = /^\/api\/v1\/job-media\/file\/[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d+\.[0-9a-f]{64}$/;

it('HA-M2-306: a media URL has no extension and its GET sends Content-Disposition', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const photo = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const video = await uploadThroughApi(customer, { kind: 'video', mime: 'video/mp4', bytes: buildMp4({ durationMs: 6_000 }), durationMs: 6_000 });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [photo.id, video.id]);

    const photoLink = (await customer.url(photo.id)).body.data.url as string;
    expect(photoLink).toMatch(NO_EXTENSION);
    expect(photoLink).not.toMatch(/\.(jpe?g|png|webp|mp4|mov|m4a|webm|ogg|3gp)$/i);
    const photoFile = await fetchSigned(photoLink);
    expect(photoFile.status).toBe(200);
    expect(photoFile.headers['content-disposition']).toBe('inline; filename="request-media.jpg"');
    expect(photoFile.headers['content-type']).toBe('image/jpeg');

    const listed = (await customer.booking(bookingId)).body.data.items as Array<{ id: string; url: string }>;
    for (const item of listed) expect(item.url).toMatch(NO_EXTENSION);

    const videoLink = listed.find(item => item.id === video.id)!.url;
    const videoFile = await fetchSigned(videoLink, 'GET', 'bytes=0-15');
    expect(videoFile.status).toBe(206);
    expect(videoFile.headers['content-disposition']).toBe('inline; filename="request-media.mp4"');
    expect(videoFile.headers['content-type']).toBe('video/mp4');
  });
}, 60000);
