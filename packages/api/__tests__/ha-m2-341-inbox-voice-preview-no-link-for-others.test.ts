// HA-M2-341 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): the inbox preview for a voice message says "Voice message"
// and never puts a link where it should not be. After provider A sends a 7
// second voice note in A's thread, the customer's inbox row for that thread
// previews "Voice message (0:07)" with no link in the preview text (the
// customer's own signed link rides separately in lastMessage.media). Provider
// B, who has a thread on the same request but is not in A's thread, gets no
// trace of it: B's inbox lists only B's thread, and nowhere in B's inbox
// response is A's recording id or any job-media link. Real routes, auth,
// job-media service and migrations 006/123/138/183/184/185 on the guarded
// PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { uploadThreadVoice, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-341: an inbox voice preview says "Voice message" and exposes no link to a non-participant', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const voiceId = await uploadThreadVoice(providerUserA, 'provider', threadA, 7_000);
    const sent = await threadHttp(providerUserA, 'provider').send(threadA, { messageType: 'voice', mediaId: voiceId });
    expect(sent.status).toBe(201);

    const customerInbox = await threadHttp(customerA, 'customer').list({ view: 'inbox' });
    expect(customerInbox.status).toBe(200);
    const rowA = (customerInbox.body.data.items as Array<Record<string, any>>).find(item => item.id === threadA);
    expect(rowA!.lastMessage).toMatchObject({
      preview: 'Voice message (0:07)',
      messageType: 'voice',
      senderIsMe: false,
      media: { id: voiceId, kind: 'voice', durationMs: 7_000 },
    });
    expect(rowA!.lastMessage.preview).not.toMatch(/job-media|https?:|\//);
    // The participant's link is minted for the participant.
    expect(rowA!.lastMessage.media.url).toMatch(new RegExp(`^/api/v1/job-media/file/${voiceId}\\.${customerA}\\.`));

    const siblingInbox = await threadHttp(providerUserB, 'provider').list({ view: 'inbox' });
    expect(siblingInbox.status).toBe(200);
    expect((siblingInbox.body.data.items as Array<{ id: string }>).map(item => item.id)).toEqual([threadB]);
    const siblingBody = JSON.stringify(siblingInbox.body);
    expect(siblingBody).not.toContain(voiceId);
    expect(siblingBody).not.toContain('/api/v1/job-media/file/');
  });
}, 90000);
