// HA-M2-159 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, added by the review fix; merged.md 2.3): the customer's
// "Message" button (POST /api/v1/conversations { bookingId, providerUserId })
// creates a provider's thread only while that provider holds a LIVE quote on
// the request. A declined quote, a quote past its expiry time, or no quote at
// all gives 404 THREAD_NOT_FOUND and creates nothing: no thread, no
// "Sent a quote" notice, nothing for the provider. (HA-M2-139 covers the live
// quote that does open a thread.) Real HTTP route on the guarded PostgreSQL
// fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-159: the customer Message button opens no thread for a pro without a live quote', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'timing',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);
    await database.query(`UPDATE booking_quotes SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [quoteFromB]);
    const customer = threadHttp(customerA, 'customer');

    const declined = await customer.open({ bookingId: requestBooking, providerUserId: providerUserA });
    const expired = await customer.open({ bookingId: requestBooking, providerUserId: providerUserB });
    await database.query('DELETE FROM booking_quotes WHERE id = $1', [quoteFromB]);
    const noQuote = await customer.open({ bookingId: requestBooking, providerUserId: providerUserB });

    for (const refused of [declined, expired, noQuote]) {
      expect(refused.status).toBe(404);
      expect(refused.body.error.code).toBe('THREAD_NOT_FOUND');
    }
    expect((await database.query('SELECT COUNT(*)::int AS count FROM conversations')).rows).toEqual([{ count: 0 }]);
    expect((await database.query('SELECT COUNT(*)::int AS count FROM messages')).rows).toEqual([{ count: 0 }]);
  });
}, 90000);
