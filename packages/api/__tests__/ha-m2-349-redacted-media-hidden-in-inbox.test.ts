// HA-M2-349 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): once a moderator redacts a voice message that is the
// last message in a thread, the other participant's inbox row no longer
// carries the recording. design-threads.md section 3: "Redacted messages get
// no media URL". Provider A sends a voice note; the customer's inbox row
// carries it with a link; an admin redacts it through the real redact
// route; the customer's next inbox shows "Message removed by a moderator"
// with media null, and nowhere in the response the upload's id or any
// job-media link. Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  adminHttp, quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { uploadThreadVoice, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

interface InboxItem { id: string; lastMessage: { createdAt: string; media: { id: string; kind: string; url: string | null } | null } }

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-349: a redacted voice message leaves no media and no link in the inbox preview', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceId = await uploadThreadVoice(providerUserA, 'provider', threadA, 8_000);
    const sent = await threadHttp(providerUserA, 'provider').send(threadA, { messageType: 'voice', mediaId: voiceId });
    expect(sent.status).toBe(201);
    const customer = threadHttp(customerA, 'customer');
    const before = await customer.list({ view: 'inbox' });
    const rowBefore = (before.body.data.items as InboxItem[]).find(item => item.id === threadA);
    expect(rowBefore!.lastMessage.media).toMatchObject({ id: voiceId, kind: 'voice' });
    expect(rowBefore!.lastMessage.media!.url).toMatch(new RegExp(`^/api/v1/job-media/file/${voiceId}\\.${customerA}\\.`));

    const redacted = await adminHttp().post(`/conversations/messages/${sent.body.data.id}/redact`, {
      reason: 'The recording reads out a phone number',
    });
    expect(redacted.status).toBe(200);

    const inbox = await customer.list({ view: 'inbox' });

    expect(inbox.status).toBe(200);
    const row = (inbox.body.data.items as InboxItem[]).find(item => item.id === threadA);
    expect(row!.lastMessage).toEqual({
      preview: 'Message removed by a moderator',
      messageType: 'system',
      senderIsMe: false,
      createdAt: rowBefore!.lastMessage.createdAt,
      media: null,
    });
    const body = JSON.stringify(inbox.body);
    expect(body).not.toContain(voiceId);
    expect(body).not.toContain('/api/v1/job-media/file/');
  });
}, 90000);
