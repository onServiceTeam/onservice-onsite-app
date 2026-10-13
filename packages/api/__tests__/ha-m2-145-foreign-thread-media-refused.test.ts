// HA-M2-145 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// merged.md P4 test 145): a message can only carry an upload its sender made
// for that same conversation. The customer has a thread with provider A and
// one with provider B on the same request. Sending, in A's thread, a photo the
// customer uploaded for B's thread gets 422 MEDIA_INVALID; provider A sending
// a photo the customer uploaded for A's thread (someone else's upload) gets
// 422 MEDIA_INVALID too. Nothing is stored and both uploads stay unattached.
// Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { mediaState, uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-145: media from another conversation or another uploader gets 422 MEDIA_INVALID', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const photoForB = await uploadThreadPhoto(customerA, 'customer', threadB);
    const customersPhotoForA = await uploadThreadPhoto(customerA, 'customer', threadA);
    const messagesBefore = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const otherConversation = await threadHttp(customerA, 'customer').send(threadA, {
      messageType: 'image', mediaId: photoForB, content: '',
    });
    const otherUploader = await threadHttp(providerUserA, 'provider').send(threadA, {
      messageType: 'image', mediaId: customersPhotoForA, content: '',
    });

    for (const refused of [otherConversation, otherUploader]) {
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe('MEDIA_INVALID');
    }
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(messagesBefore);
    expect(await mediaState(database, photoForB)).toEqual({ status: 'stored', booking_id: null });
    expect(await mediaState(database, customersPhotoForA)).toEqual({ status: 'stored', booking_id: null });
  });
}, 90000);
