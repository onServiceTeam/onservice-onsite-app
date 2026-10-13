// HA-M2-151 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, not numbered in merged.md section 4; critique L9): an old app's
// chat photo (a public upload link) is refused in a request thread, where
// photos must be private media, and accepted in the booked thread only when it
// is the sender's own chat upload on our own upload address. Nothing is
// stored for a refused send. The fixture sets no UPLOAD_BASE_URL or S3
// settings, so the upload base is upload.service's local default
// http://localhost:7381/uploads. Real HTTP route on the guarded PostgreSQL
// fixture.
import crypto from 'node:crypto';
import {
  bookingIntegrationIt as it, customerA, customerB,
} from './helpers/booking-participant-postgres';
import {
  bookProviderA, quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const upload = (owner: string) => `http://localhost:7381/uploads/chat/${owner}/${crypto.randomUUID()}.jpg`;

it('HA-M2-151: an old app\'s photo link is accepted only in the booked thread and only from the sender\'s own chat upload', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const customer = threadHttp(customerA, 'customer');
    const photo = (imageUrl: string) => customer.send(threadA, { messageType: 'image', imageUrl, content: 'Photo' });

    const atRequestStage = await photo(upload(customerA));
    expect(atRequestStage.status).toBe(422);
    expect(atRequestStage.body.error.code).toBe('MEDIA_INVALID');

    await bookProviderA(database);
    const someoneElses = await photo(upload(customerB));
    // Same path shape, but on an outside address.
    const outsideHost = await photo(`https://images.example.test/chat/${customerA}/${crypto.randomUUID()}.jpg`);
    const notChat = await photo(`http://localhost:7381/uploads/general/${customerA}/${crypto.randomUUID()}.jpg`);
    const own = await photo(upload(customerA));

    expect([someoneElses.status, outsideHost.status, notChat.status]).toEqual([422, 422, 422]);
    expect(own.status).toBe(201);
    expect(own.body.data).toMatchObject({ messageType: 'image', content: 'Photo', caption: null });
    expect((await database.query(`SELECT message_type, image_url FROM messages WHERE sender_id = $1`, [customerA])).rows)
      .toEqual([{ message_type: 'image', image_url: own.body.data.imageUrl }]);
  });
}, 90000);
