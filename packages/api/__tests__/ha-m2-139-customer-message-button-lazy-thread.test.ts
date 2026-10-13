// HA-M2-139 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the customer's "Message" button on a quote card
// (POST /api/v1/conversations { bookingId, providerUserId }) creates that
// provider's thread when none exists yet (for example when the after-quote
// hook never ran) and the quote is live, posting quote_sent once; with
// request_threads_enabled off it is refused with 404 THREAD_NOT_FOUND and
// nothing is created. Real HTTP route on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-139: the customer Message button creates the thread lazily and is refused when threads are switched off', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const customer = threadHttp(customerA, 'customer');

    const opened = await customer.open({ bookingId: requestBooking, providerUserId: providerUserA });
    const again = await customer.open({ bookingId: requestBooking, providerUserId: providerUserA });

    expect(opened.status).toBe(201);
    expect(opened.body.data).toMatchObject({
      bookingId: requestBooking, providerId: providerUserA, state: 'open', stage: 'request',
      otherParty: { userId: providerUserA, displayName: 'Ben S.', role: 'provider' },
    });
    expect(again.body.data.id).toBe(opened.body.data.id);
    expect((await database.query(`SELECT opened_by_quote_id FROM conversations WHERE booking_id = $1`,
      [requestBooking])).rows).toEqual([{ opened_by_quote_id: quoteFromA }]);
    expect((await database.query(`SELECT sender_id, system_event FROM messages`)).rows)
      .toEqual([{ sender_id: providerUserA, system_event: 'quote_sent' }]);
  });

  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);

    const refused = await threadHttp(customerA, 'customer').open({ bookingId: requestBooking, providerUserId: providerUserA });

    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('THREAD_NOT_FOUND');
    expect((await database.query('SELECT COUNT(*)::int AS count FROM conversations')).rows).toEqual([{ count: 0 }]);
  }, { threadsEnabled: false });
}, 120000);
