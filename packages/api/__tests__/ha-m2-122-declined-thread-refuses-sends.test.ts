// HA-M2-122 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// once the customer declines provider A's quote, sending into that thread is
// refused for both participants with 409 THREAD_READ_ONLY and nothing is
// stored. The read-only state is derived from the quote (the thread row is
// not written by the decline). Real HTTP routes on the guarded PostgreSQL
// fixture with the real 185 schema.
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

it('HA-M2-122: sending into a thread whose quote was declined gets 409 THREAD_READ_ONLY', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const provider = threadHttp(providerUserA, 'provider');
    const customer = threadHttp(customerA, 'customer');
    expect((await provider.send(threadA, { content: 'I can also check the drain line.' })).status).toBe(201);

    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);
    const before = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const fromProvider = await provider.send(threadA, { content: 'Can I lower the price?' });
    const fromCustomer = await customer.send(threadA, { content: 'Sorry, too expensive for me.' });

    for (const response of [fromProvider, fromCustomer]) {
      expect(response.status).toBe(409);
      expect(response.body.error).toEqual({
        message: 'This conversation is read-only.', statusCode: 409, code: 'THREAD_READ_ONLY',
      });
    }
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(before);
    expect((await database.query('SELECT state, state_reason FROM conversations WHERE id = $1', [threadA])).rows)
      .toEqual([{ state: 'open', state_reason: null }]);
  });
}, 90000);
