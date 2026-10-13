// HA-M2-350 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): the kind of upload must match the kind of message. A
// stored voice recording sent as a photo message (messageType 'image') gets
// 422 MEDIA_INVALID: the send asks the attach for the kind its message type
// carries ('image' means a photo), never the kind the upload says it is, so
// an audio file can never be stored and shown as a photo. Nothing is stored
// and the recording stays unattached (status 'stored', no booking), so it
// can still be sent as a voice message. Real routes, auth, job-media service
// and migrations 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { mediaState, uploadThreadVoice, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-350: a voice recording sent as a photo message gets 422 and stays unattached', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const voiceId = await uploadThreadVoice(providerUserA, 'provider', threadA, 6_000);
    const messagesBefore = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const refused = await threadHttp(providerUserA, 'provider').send(threadA, {
      messageType: 'image', mediaId: voiceId, content: 'The unit before cleaning',
    });

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('MEDIA_INVALID');
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(messagesBefore);
    expect(await mediaState(database, voiceId)).toEqual({ status: 'stored', booking_id: null });
  });
}, 90000);
