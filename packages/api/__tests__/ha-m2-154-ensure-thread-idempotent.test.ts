// HA-M2-154 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, not numbered in merged.md section 4): ensureRequestThread, the
// hook P2 calls after a quote is admitted, is safe to run more than once at
// the same time: one thread and one quote_sent message come out of three
// concurrent calls, and the thread records the quote that opened it. Real
// service on the guarded PostgreSQL fixture with the 185 unique rules. (The
// "no quote, no thread" case that used to sit here is covered through the
// customer's Message button in HA-M2-159.)
import {
  bookingIntegrationIt as it, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-154: concurrent ensureRequestThread calls open one thread with one quote_sent', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await database.query('DELETE FROM booking_quotes WHERE id = $1', [quoteFromB]);

    const results = await Promise.all([1, 2, 3].map(() => ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA })));

    const ids = new Set(results.map(result => result!.conversationId));
    expect(ids.size).toBe(1);
    expect(results.filter(result => result!.created)).toHaveLength(1);
    expect((await database.query(`SELECT provider_id, opened_by_quote_id FROM conversations`)).rows)
      .toEqual([{ provider_id: providerUserA, opened_by_quote_id: quoteFromA }]);
    expect((await database.query(`SELECT system_event FROM messages`)).rows).toEqual([{ system_event: 'quote_sent' }]);
  });
}, 90000);
