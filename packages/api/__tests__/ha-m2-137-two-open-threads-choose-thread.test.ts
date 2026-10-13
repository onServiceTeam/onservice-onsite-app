// HA-M2-137 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// a customer opening chat for a booking without naming a provider
// (POST /api/v1/conversations { bookingId }, as old apps do) while two
// providers hold open threads and none is booked gets 409 CHOOSE_THREAD, and
// no thread is created. With exactly one open thread that thread is returned.
// Real HTTP route on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-137: two open threads and no booked provider give 409 CHOOSE_THREAD', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB });
    const customer = threadHttp(customerA, 'customer');

    const ambiguous = await customer.open({ bookingId: requestBooking });

    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error).toEqual({
      message: 'Choose which pro you want to message.', statusCode: 409, code: 'CHOOSE_THREAD',
    });
    expect((await database.query('SELECT COUNT(*)::int AS count FROM conversations WHERE booking_id = $1',
      [requestBooking])).rows).toEqual([{ count: 2 }]);

    // With one thread left open, that thread is the answer.
    await database.query(`UPDATE booking_quotes SET status = 'withdrawn' WHERE id = $1`, [quoteFromB]);
    const single = await customer.open({ bookingId: requestBooking });
    expect(single.status).toBe(201);
    expect(single.body.data).toMatchObject({ id: threadA, state: 'open', stage: 'request' });
  });
}, 90000);
