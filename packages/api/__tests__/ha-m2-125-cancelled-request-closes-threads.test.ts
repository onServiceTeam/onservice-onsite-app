// HA-M2-125 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// when a quote request is cancelled before any provider is booked, every
// thread on it reads read-only with reason request_cancelled, in the inbox and
// on send, although the quotes themselves are still live. Real HTTP routes on
// the guarded PostgreSQL fixture with the real 185 schema.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-125: a cancelled request makes all its threads read-only', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const customer = threadHttp(customerA, 'customer');
    expect((await customer.list({ view: 'inbox', state: 'open' })).body.data.meta.total).toBe(2);

    await database.query(`UPDATE bookings SET status = 'cancelled_by_customer', cancelled_at = NOW(),
        cancellation_reason = 'Found someone else' WHERE id = $1`, [requestBooking]);

    const inbox = await customer.list({ view: 'inbox' });
    expect(inbox.body.data.items.map((item: { id: string; state: string; stateReason: string }) => (
      [item.id, item.state, item.stateReason]))).toEqual(expect.arrayContaining([
      [threadA, 'read_only', 'request_cancelled'],
      [threadB, 'read_only', 'request_cancelled'],
    ]));
    expect((await customer.list({ view: 'inbox', state: 'open' })).body.data.meta.total).toBe(0);
    expect((await customer.send(threadA, { content: 'Never mind, please come.' })).body.error.code).toBe('THREAD_READ_ONLY');
    expect((await threadHttp(providerUserA, 'provider').send(threadA, { content: 'Still free tomorrow.' })).status)
      .toBe(409);
    expect((await database.query(`SELECT status FROM booking_quotes WHERE booking_id = $1`, [requestBooking])).rows)
      .toEqual([{ status: 'submitted' }, { status: 'submitted' }]);
  });
}, 90000);
