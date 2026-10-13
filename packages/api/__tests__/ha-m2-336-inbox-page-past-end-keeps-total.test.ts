// HA-M2-336 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number, see HA-M2-330): GET /api/v1/conversations?view=inbox
// reports the real number of threads in meta even when the page asked for is
// past the end. Before the fix the total came from the first returned row, so
// an empty page said 0 threads and 0 pages, and an app refreshing its badge
// or pager from that response showed no conversations. Real HTTP route on the
// guarded PostgreSQL fixture.
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

it('HA-M2-336: an inbox page past the end still reports the real total', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA });
    await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB });
    const customer = threadHttp(customerA, 'customer');

    const lastPage = await customer.list({ view: 'inbox', pageSize: '1', page: '2' });
    const pastEnd = await customer.list({ view: 'inbox', pageSize: '1', page: '3' });
    const readOnlyPastEnd = await customer.list({ view: 'inbox', state: 'read_only', pageSize: '1', page: '2' });

    expect(lastPage.body.data.items).toHaveLength(1);
    expect(lastPage.body.data.meta).toEqual({ total: 2, page: 2, pageSize: 1, totalPages: 2 });
    expect(pastEnd.status).toBe(200);
    expect(pastEnd.body.data.items).toEqual([]);
    expect(pastEnd.body.data.meta).toEqual({ total: 2, page: 3, pageSize: 1, totalPages: 2 });
    // The count follows the same filter as the list.
    expect(readOnlyPastEnd.body.data.meta).toEqual({ total: 0, page: 2, pageSize: 1, totalPages: 0 });
  });
}, 90000);
