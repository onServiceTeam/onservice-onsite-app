// HA-M2-354 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): a moderator can still see a photo after redacting it,
// as they still see a redacted message's text, so the redaction can be
// reviewed. The participants lose the photo (HA-M2-348); the admin thread
// view (GET /admin/conversations/:id) still returns the redacted photo
// message with a link signed for the admin, and that link serves the photo.
// This is also the photo case of the admin view's links (HA-M2-148 covers
// voice). Real admin routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, operatorId, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  adminHttp, quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned } from './helpers/job-media-postgres';
import { uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

interface AdminMessage { id: string; redactedAt: string | null; media: { id: string; kind: string; url: string | null } | null }

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-354: the admin thread view still returns a working link for a redacted photo', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(providerUserA, 'provider', threadA);
    const sent = await threadHttp(providerUserA, 'provider').send(threadA, {
      messageType: 'image', mediaId: photoId, content: 'My number is on the van door',
    });
    expect(sent.status).toBe(201);
    const admin = adminHttp();
    expect((await admin.post(`/conversations/messages/${sent.body.data.id}/redact`, {
      reason: 'The photo shows a phone number',
    })).status).toBe(200);

    const view = await admin.get(`/conversations/${threadA}`);

    expect(view.status).toBe(200);
    const photo = (view.body.data.messages as AdminMessage[]).find(message => message.id === sent.body.data.id);
    expect(photo).toMatchObject({
      messageType: 'image',
      content: 'My number is on the van door',
      redactionReason: 'The photo shows a phone number',
      mediaId: photoId,
      media: { id: photoId, kind: 'photo', mime: 'image/jpeg' },
    });
    expect(photo!.redactedAt).not.toBeNull();
    expect(photo!.media!.url).toMatch(new RegExp(`^/api/v1/job-media/file/${photoId}\\.${operatorId}\\.`));
    const served = await fetchSigned(photo!.media!.url!);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
  });
}, 90000);
