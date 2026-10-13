// HA-M2-339 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): a thread that went read-only refuses a photo or voice
// message and leaves the upload unattached. Provider A uploads a photo and a
// voice note while the thread is open; the customer then declines A's quote
// (the thread reads read_only / quote_declined). Sending either one now gets
// 409 THREAD_READ_ONLY, no message is stored, and both uploads stay 'stored'
// with no booking, so they can still be removed or expire. Real routes, auth,
// job-media service and migrations 006/123/138/183/184/185 on the guarded
// PostgreSQL fixture.
import {
  bookingIntegrationIt as it, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { declineQuote } from './helpers/job-media-postgres';
import {
  mediaState, uploadThreadPhoto, uploadThreadVoice, withThreadMediaDatabase,
} from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-339: a read-only thread refuses a media send and leaves the media unattached', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(providerUserA, 'provider', threadA);
    const voiceId = await uploadThreadVoice(providerUserA, 'provider', threadA);
    await declineQuote(database, quoteFromA);
    const messagesBefore = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const provider = threadHttp(providerUserA, 'provider');
    const photo = await provider.send(threadA, { messageType: 'image', mediaId: photoId, content: 'Before and after' });
    const voice = await provider.send(threadA, { messageType: 'voice', mediaId: voiceId });

    for (const refused of [photo, voice]) {
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('THREAD_READ_ONLY');
    }
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(messagesBefore);
    expect(await mediaState(database, photoId)).toEqual({ status: 'stored', booking_id: null });
    expect(await mediaState(database, voiceId)).toEqual({ status: 'stored', booking_id: null });
  });
}, 90000);
