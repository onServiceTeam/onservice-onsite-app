// HA-M2-133 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// an app retrying a send with the same clientMessageId (a weak connection that
// lost the first reply) stores one message and tells the other participant
// once: the retry answers 200 { duplicate: true } with the first message.
// Real HTTP route on the guarded PostgreSQL fixture with the 185 unique index.
import crypto from 'node:crypto';
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

it('HA-M2-133: a repeated clientMessageId stores one message', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const customer = threadHttp(customerA, 'customer');
    const body = { content: 'Is 2 PM okay for you?', clientMessageId: crypto.randomUUID() };

    const first = await customer.send(threadA, body);
    const retry = await customer.send(threadA, body);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({
      id: first.body.data.id, content: 'Is 2 PM okay for you?', clientMessageId: body.clientMessageId, duplicate: true,
    });
    expect((await database.query(`SELECT id FROM messages WHERE sender_id = $1`, [customerA])).rows)
      .toEqual([{ id: first.body.data.id }]);
    expect((await database.query(`SELECT COUNT(*)::int AS count FROM notifications
        WHERE user_id = $1 AND type = 'new_message'`, [providerUserA])).rows).toEqual([{ count: 1 }]);
  });
}, 90000);
