// HA-M2-333 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number, see HA-M2-330; design-threads.md section 3: "text needs
// at least one non-space character"): a text message made only of spaces or
// line breaks is refused with 400 on the content field and stores nothing.
// This is a change for old apps, which could store "   " before; the old
// "empty content" rule (messaging-validators.test.ts) is unchanged. Real HTTP
// route on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-333: a text message of only spaces gets 400 and stores nothing', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const before = (await database.query('SELECT id FROM messages ORDER BY id')).rows;
    const customer = threadHttp(customerA, 'customer');

    for (const body of [{ content: '   ' }, { content: ' \n\t ', messageType: 'text' }]) {
      const refused = await customer.send(threadA, body);
      expect(refused.status).toBe(400);
      expect(refused.body.error.details).toEqual([{ field: 'content', message: 'Message cannot be empty' }]);
    }
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(before);
  });
}, 90000);
