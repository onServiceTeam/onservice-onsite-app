// HA-M2-342 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): the off-platform phrase check covers the caption of a
// private photo in a request thread (before booking, when contact details
// are most likely to be traded). Provider A sends two photos with mediaId: the
// one captioned "Send the deposit to my gcash instead" is stored flagged for
// moderation, the one captioned "This is the drain pan" is not. Both are
// stored with their media. Real routes, auth, job-media service and
// migrations 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { threadPhotoBytes, uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-342: a private photo whose caption has an off-platform phrase is flagged at send', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const flaggedPhoto = await uploadThreadPhoto(providerUserA, 'provider', threadA, threadPhotoBytes(700));
    const cleanPhoto = await uploadThreadPhoto(providerUserA, 'provider', threadA, threadPhotoBytes(800));
    const provider = threadHttp(providerUserA, 'provider');

    const flagged = await provider.send(threadA, {
      messageType: 'image', mediaId: flaggedPhoto, content: 'Send the deposit to my gcash instead',
    });
    const clean = await provider.send(threadA, {
      messageType: 'image', mediaId: cleanPhoto, content: 'This is the drain pan',
    });

    expect([flagged.status, clean.status]).toEqual([201, 201]);
    expect((await database.query(`SELECT media_id, content, is_flagged FROM messages
        WHERE sender_id = $1 AND message_type = 'image' ORDER BY created_at`, [providerUserA])).rows).toEqual([
      { media_id: flaggedPhoto, content: 'Send the deposit to my gcash instead', is_flagged: true },
      { media_id: cleanPhoto, content: 'This is the drain pan', is_flagged: false },
    ]);
  });
}, 90000);
