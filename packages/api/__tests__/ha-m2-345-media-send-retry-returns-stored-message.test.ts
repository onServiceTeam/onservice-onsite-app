// HA-M2-345 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): an app that retries a photo send (same clientMessageId,
// same mediaId, e.g. after a dropped connection) gets the message it already
// stored, not an error and not a second copy. The first send is 201 with the
// sender's own signed link; the retry is 200 {duplicate: true} with the same
// message id and media, and its link serves the photo too. One message row,
// one attached upload. (The upload cannot be attached twice, so a retry that
// re-ran the attach would get 422 instead.) Real routes, auth, job-media
// service and migrations 006/123/138/183/184/185 on the guarded PostgreSQL
// fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned } from './helpers/job-media-postgres';
import { mediaState, uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-345: retrying a media send with the same clientMessageId returns the stored message once', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(customerA, 'customer', threadA);
    const customer = threadHttp(customerA, 'customer');
    const body = {
      messageType: 'image', mediaId: photoId, content: 'The leak is here',
      clientMessageId: '86000000-0000-4000-8000-000000000345',
    };

    const first = await customer.send(threadA, body);
    const retry = await customer.send(threadA, body);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({
      id: first.body.data.id, duplicate: true, caption: 'The leak is here', media: { id: photoId, kind: 'photo' },
    });
    for (const response of [first, retry]) {
      expect(response.body.data.media.url).toMatch(new RegExp(`/file/${photoId}\\.${customerA}\\.`));
      expect((await fetchSigned(response.body.data.media.url)).status).toBe(200);
    }
    expect((await database.query('SELECT id FROM messages WHERE sender_id = $1', [customerA])).rows)
      .toEqual([{ id: first.body.data.id }]);
    expect(await mediaState(database, photoId)).toEqual({ status: 'attached', booking_id: requestBooking });
  });
}, 90000);
