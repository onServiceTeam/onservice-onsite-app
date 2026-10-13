// HA-M2-348 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): once a moderator redacts a photo message, the other
// participant's thread page no longer carries the photo. design-threads.md
// section 3: "Redacted messages get no media URL". Provider A sends a
// captioned photo; the customer's thread page shows it with a link; an admin
// redacts it through the real redact route; the customer's next page shows
// the moderator notice with media null, no caption, and nowhere in the
// response the upload's id or any job-media link. (The job-media routes'
// own viewer rule is package P3's and is not covered here.) Real routes,
// auth, job-media service and migrations 006/123/138/183/184/185 on the
// guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  adminHttp, quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

interface PageMessage { id: string; media: { id: string; kind: string; url: string | null } | null }

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-348: a redacted photo message reads with no media and no link in the thread page', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(providerUserA, 'provider', threadA);
    const sent = await threadHttp(providerUserA, 'provider').send(threadA, {
      messageType: 'image', mediaId: photoId, content: 'My number is on the van door',
    });
    expect(sent.status).toBe(201);
    const customer = threadHttp(customerA, 'customer');
    const before = await customer.messages(threadA, { limit: 30 });
    const shown = (before.body.data as PageMessage[]).find(message => message.id === sent.body.data.id);
    expect(shown!.media).toMatchObject({ id: photoId, kind: 'photo' });
    expect(shown!.media!.url).toMatch(new RegExp(`^/api/v1/job-media/file/${photoId}\\.${customerA}\\.`));

    const redacted = await adminHttp().post(`/conversations/messages/${sent.body.data.id}/redact`, {
      reason: 'The photo shows a phone number',
    });
    expect(redacted.status).toBe(200);

    const page = await customer.messages(threadA, { limit: 30 });

    expect(page.status).toBe(200);
    const removed = (page.body.data as PageMessage[]).find(message => message.id === sent.body.data.id);
    expect(removed).toMatchObject({
      redacted: true,
      messageType: 'system',
      content: 'This message was removed by a moderator.',
      caption: null,
      imageUrl: null,
      media: null,
    });
    const body = JSON.stringify(page.body);
    expect(body).not.toContain(photoId);
    expect(body).not.toContain('/api/v1/job-media/file/');
  });
}, 90000);
