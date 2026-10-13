// HA-M2-353 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): the old-app message read (page and pageSize, no cursor)
// also mints each reader's own link for a photo message. Old apps (1.0.2,
// 1.0.3) still read threads this way; a new app that falls back to it must
// get a working photo too. After the customer sends a photo, provider A's
// page read returns the message with media.url signed for provider A
// (never the sender's link), and that link serves the exact uploaded file.
// Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned } from './helpers/job-media-postgres';
import { threadPhotoBytes, uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

interface PageMessage { id: string; media: { id: string; kind: string; url: string | null } | null }

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-353: the old-app page read returns a photo message with the reader\'s own working link', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(customerA, 'customer', threadA, threadPhotoBytes(1_353));
    const sent = await threadHttp(customerA, 'customer').send(threadA, { messageType: 'image', mediaId: photoId });
    expect(sent.status).toBe(201);
    const uploaded = (await database.query<{ size_bytes: string }>('SELECT size_bytes FROM job_media WHERE id = $1',
      [photoId])).rows[0]!;

    const page = await threadHttp(providerUserA, 'provider').messages(threadA, { page: 1, pageSize: 50 });

    expect(page.status).toBe(200);
    expect(page.body.meta).toMatchObject({ page: 1, pageSize: 50 });
    const photo = (page.body.data as PageMessage[]).find(message => message.id === sent.body.data.id);
    expect(photo).toMatchObject({ messageType: 'image', content: 'Photo', media: { id: photoId, kind: 'photo' } });
    expect(photo!.media!.url).toMatch(new RegExp(`^/api/v1/job-media/file/${photoId}\\.${providerUserA}\\.`));
    const served = await fetchSigned(photo!.media!.url!);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect((served.body as Buffer).length).toBe(Number(uploaded.size_bytes));
  });
}, 90000);
