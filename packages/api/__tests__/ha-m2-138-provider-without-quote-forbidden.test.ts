// HA-M2-138 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// a provider who has not quoted on a request (and is not booked on it) cannot
// open a thread with the customer: POST /api/v1/conversations answers 403
// and nothing is created (D38: the thread opens when the quote is sent). A
// provider who did quote gets their own thread. Real HTTP route on the
// guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-138: a provider with no quote on the request gets 403 and no thread', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await database.query('DELETE FROM booking_quotes WHERE id = $1', [quoteFromB]);

    const refused = await threadHttp(providerUserB, 'provider').open({ bookingId: requestBooking });

    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toBe('You can message the customer after you send a quote.');
    expect((await database.query('SELECT COUNT(*)::int AS count FROM conversations')).rows).toEqual([{ count: 0 }]);

    const quoted = await threadHttp(providerUserA, 'provider').open({ bookingId: requestBooking });
    expect(quoted.status).toBe(201);
    expect(quoted.body.data).toMatchObject({
      bookingId: requestBooking, customerId: customerA, providerId: providerUserA, state: 'open', stage: 'request',
    });
  });
}, 90000);
