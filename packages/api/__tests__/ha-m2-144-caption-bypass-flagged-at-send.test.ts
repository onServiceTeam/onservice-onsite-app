// HA-M2-144 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the off-platform phrase check now runs on photo captions too, not only on
// text messages: a booked-thread photo whose caption says "message me on
// viber" is stored flagged for moderation, and a photo with a plain caption is
// not. (Until thread media lands in wave 3, a captioned photo is an old app's
// chat upload in a booked thread.) Real HTTP route on the guarded PostgreSQL
// fixture.
import crypto from 'node:crypto';
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  bookProviderA, quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const chatUpload = () => `http://localhost:7381/uploads/chat/${customerA}/${crypto.randomUUID()}.jpg`;

it('HA-M2-144: a caption with an off-platform phrase is flagged at send', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    await bookProviderA(database);
    const customer = threadHttp(customerA, 'customer');

    const flagged = await customer.send(threadA, {
      messageType: 'image', imageUrl: chatUpload(), content: 'This is the unit. Message me on viber instead.',
    });
    const clean = await customer.send(threadA, {
      messageType: 'image', imageUrl: chatUpload(), content: 'This is the unit by the window.',
    });

    expect(flagged.status).toBe(201);
    expect(clean.status).toBe(201);
    expect(flagged.body.data).toMatchObject({ messageType: 'image', caption: 'This is the unit. Message me on viber instead.' });
    expect((await database.query(`SELECT content, message_type, is_flagged FROM messages
        WHERE sender_id = $1 ORDER BY created_at`, [customerA])).rows).toEqual([
      { content: 'This is the unit. Message me on viber instead.', message_type: 'image', is_flagged: true },
      { content: 'This is the unit by the window.', message_type: 'image', is_flagged: false },
    ]);
  });
}, 90000);
