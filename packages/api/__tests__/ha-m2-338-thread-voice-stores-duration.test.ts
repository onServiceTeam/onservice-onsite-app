// HA-M2-338 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): a voice message stores the voice note's length. The customer
// records a 12.4 second note (the server measures it from the M4A file), and
// POST /:id/messages {messageType: 'voice', mediaId} stores the message with
// media_id and media_duration_ms = 12400, the measured length, never a value
// from the request body. The response shows the length and old apps' text
// "Voice message (0:12)". Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { uploadThreadVoice, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-338: a voice message stores media_duration_ms from the measured recording', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceId = await uploadThreadVoice(customerA, 'customer', threadA, 12_400);

    const sent = await threadHttp(customerA, 'customer').send(threadA, { messageType: 'voice', mediaId: voiceId });

    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({
      messageType: 'voice',
      content: 'Voice message (0:12)',
      caption: null,
      media: { id: voiceId, kind: 'voice', mime: 'audio/mp4', durationMs: 12_400 },
    });
    expect((await database.query(`SELECT message_type, content, media_id, media_duration_ms
        FROM messages WHERE id = $1`, [sent.body.data.id])).rows).toEqual([{
      message_type: 'voice', content: '', media_id: voiceId, media_duration_ms: 12_400,
    }]);
  });
}, 90000);
