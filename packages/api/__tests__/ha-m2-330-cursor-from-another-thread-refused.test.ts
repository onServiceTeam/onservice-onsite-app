// HA-M2-330 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number: the P4 range 120-159 is used up, so the review fix
// numbers its extra tests from 330, as the critique did with 290-309): a
// paging cursor (before= or after=) must be a message in the thread being
// read. A message id from another thread, even one the same customer can
// read, is refused with 400 CURSOR_NOT_IN_THREAD instead of being used as a
// time boundary. This case used to sit inside HA-M2-131; it is its own
// behaviour. Real HTTP route on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  insertMessage, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-330: a paging cursor from another thread gets 400 CURSOR_NOT_IN_THREAD', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    await insertMessage(database, threadA, providerUserA, 'I can come on Monday.');
    const strayCursor = await insertMessage(database, threadB, customerA, 'Message in the other thread.');
    const customer = threadHttp(customerA, 'customer');

    for (const query of [{ before: strayCursor, limit: 10 }, { after: strayCursor, limit: 10 }]) {
      const refused = await customer.messages(threadA, query);
      expect(refused.status).toBe(400);
      expect(refused.body.error.code).toBe('CURSOR_NOT_IN_THREAD');
      expect(refused.body.data).toBeUndefined();
    }
    // The same cursor works in its own thread.
    expect((await customer.messages(threadB, { before: strayCursor, limit: 10 })).status).toBe(200);
  });
}, 90000);
