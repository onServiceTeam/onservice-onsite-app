// HA-M2-124 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// booking provider A (the state acceptQuote leaves: provider A assigned,
// payment_pending, provider B's quote declined as not selected) makes
// provider B's thread read-only with reason other_provider_booked, keeps
// provider A's thread open as the booking thread, and writes nothing to
// either conversation row. Real HTTP routes on the guarded PostgreSQL
// fixture with the real 185 schema.
import {
  bookingIntegrationIt as it, customerA, providerUserB,
} from './helpers/booking-participant-postgres';
import { tableColumns, tableRows } from './helpers/request-engine-postgres';
import {
  bookProviderA, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-124: booking provider A makes provider B\'s thread read-only with no write to the thread', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const columns = await tableColumns(database, 'conversations');
    const conversationsBefore = await tableRows(database, 'conversations', columns);

    await bookProviderA(database);

    const providerB = threadHttp(providerUserB, 'provider');
    const customer = threadHttp(customerA, 'customer');
    expect((await providerB.get(threadB)).body.data).toMatchObject({
      state: 'read_only', stateReason: 'other_provider_booked', stage: 'request',
    });
    expect((await customer.get(threadA)).body.data).toMatchObject({ state: 'open', stateReason: null, stage: 'booking' });
    expect((await providerB.send(threadB, { content: 'Still available if needed.' })).body.error.code)
      .toBe('THREAD_READ_ONLY');
    expect(await tableRows(database, 'conversations', columns)).toEqual(conversationsBefore);
  });
}, 90000);
