// HA-M2-352 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; a W3-B overflow number, added by the review fix after
// 337-345 ran out): a photo message is either a private upload (mediaId,
// new apps) or an old app's public link (imageUrl), never both. A send with
// both gets 400 from the validator, naming imageUrl, before any database
// work: nothing is stored and the upload stays unattached. The link used is
// a well-formed own-upload link for this sender, so only the "not both" rule
// refuses it. Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { mediaState, uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-352: a photo send with both mediaId and imageUrl gets 400 and stores nothing', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(customerA, 'customer', threadA);
    const messagesBefore = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const refused = await threadHttp(customerA, 'customer').send(threadA, {
      messageType: 'image',
      mediaId: photoId,
      imageUrl: `http://localhost:7381/uploads/chat/${customerA}/87000000-0000-4000-8000-000000000352.jpg`,
      content: 'The water stain',
    });

    expect(refused.status).toBe(400);
    expect(refused.body.error.details).toEqual([
      { field: 'imageUrl', message: 'Send mediaId or imageUrl, not both.' },
    ]);
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(messagesBefore);
    expect(await mediaState(database, photoId)).toEqual({ status: 'stored', booking_id: null });
  });
}, 90000);
