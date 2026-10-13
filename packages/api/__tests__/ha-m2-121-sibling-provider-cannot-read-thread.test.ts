// HA-M2-121 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// provider B, who quoted on the same request, cannot open, read or write in
// provider A's thread with the customer: every route answers 404 and nothing
// is stored. Real HTTP routes and authentication on the guarded PostgreSQL
// fixture with the real 185 schema.
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  insertMessage, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-121: provider B gets 404 on provider A\'s thread and cannot read or write in it', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB });
    await insertMessage(database, threadA, customerA, 'Can you come before noon?');
    const messagesBefore = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const providerB = threadHttp(providerUserB, 'provider');
    const responses = [
      await providerB.get(threadA),
      await providerB.messages(threadA, { limit: 30 }),
      await providerB.messages(threadA, { page: 1, pageSize: 50 }),
      await providerB.send(threadA, { content: 'I can do it cheaper.' }),
    ];

    expect(responses.map(response => response.status)).toEqual([404, 404, 404, 404]);
    expect(responses.map(response => response.body.error.message)).toEqual([
      'Conversation not found.', 'Conversation not found.', 'Conversation not found.', 'Conversation not found.',
    ]);
    expect(JSON.stringify(responses.map(response => response.body))).not.toContain('before noon');
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(messagesBefore);
    // Provider A, the thread's own provider, can read it.
    expect((await threadHttp(providerUserA, 'provider').messages(threadA, { limit: 30 })).status).toBe(200);
  });
}, 90000);
