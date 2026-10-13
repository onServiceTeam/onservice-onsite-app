// HA-M2-130 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the notice for a new chat message says only who wrote ("New message from
// Ana R."), never the message itself or any number in it. Its data carries
// conversationId, bookingId and stage, and providerUserId only when the
// customer is the one being told. The stored notification row is exactly
// what the device push sends (createPushNotification stores it first); device
// push stays off through the fixture's stored preferences. Real HTTP send on
// the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-130: the new-message push says "New message from Ana R." and carries no message content', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    expect((await threadHttp(customerA, 'customer').send(threadA, {
      content: 'Call me at 0917 555 1234 before you leave.',
    })).status).toBe(201);
    expect((await threadHttp(providerUserA, 'provider').send(threadA, {
      content: 'Sure, I will call at 8:30.',
    })).status).toBe(201);

    const notices = (await database.query(`SELECT user_id, type, title, body, data FROM notifications
        WHERE type = 'new_message' ORDER BY created_at`)).rows;
    expect(notices).toEqual([
      {
        user_id: providerUserA, type: 'new_message', title: 'New message', body: 'New message from Ana R.',
        data: {
          type: 'new_message', notificationType: 'new_message',
          conversationId: threadA, bookingId: requestBooking, stage: 'request',
        },
      },
      {
        user_id: customerA, type: 'new_message', title: 'New message', body: 'New message from Ben S.',
        data: {
          type: 'new_message', notificationType: 'new_message',
          conversationId: threadA, bookingId: requestBooking, stage: 'request', providerUserId: providerUserA,
        },
      },
    ]);
    for (const notice of notices) {
      expect(`${notice.title} ${notice.body}`).not.toMatch(/\d/);
      expect(JSON.stringify(notice)).not.toMatch(/0917|8:30|call/i);
    }
  });
}, 90000);
