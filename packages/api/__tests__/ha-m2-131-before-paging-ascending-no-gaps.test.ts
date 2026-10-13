// HA-M2-131 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// "Load earlier messages" (GET /:id/messages?before=<id>&limit=) returns each
// older page oldest to newest, and walking back page by page returns every
// message exactly once, including messages that share one timestamp (keyset
// on created_at, then id). Real HTTP route on the guarded PostgreSQL
// fixture. (The foreign-cursor refusal that used to sit here is its own
// behaviour now: HA-M2-330.)
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  insertMessage, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const thread = '88000000-0000-4000-8000-000000000001';

it('HA-M2-131: before paging returns ascending pages that cover every message with no gaps or repeats', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await database.query(`INSERT INTO conversations (id, booking_id, customer_id, provider_id) VALUES
      ($1, $2, $3, $4)`, [thread, requestBooking, customerA, providerUserA]);
    const tied = '2026-10-14T02:00:00.000Z';
    for (const [sender, content, at] of [
      [customerA, 'one', '2026-10-14T01:00:00.000Z'],
      [providerUserA, 'two', '2026-10-14T01:30:00.000Z'],
      [customerA, 'three', tied],
      [providerUserA, 'four', tied],
      [customerA, 'five', tied],
      [providerUserA, 'six', '2026-10-14T02:30:00.000Z'],
      [customerA, 'seven', '2026-10-14T03:00:00.000Z'],
    ] as const) {
      await insertMessage(database, thread, sender, content, at);
    }
    const expected = (await database.query(`SELECT id FROM messages WHERE conversation_id = $1
        ORDER BY created_at, id`, [thread])).rows.map(row => row.id as string);
    const customer = threadHttp(customerA, 'customer');

    const pages: Array<{ ids: string[]; hasMore: boolean }> = [];
    let before: string | undefined;
    for (let guard = 0; guard < 5; guard += 1) {
      const response = await customer.messages(thread, before ? { before, limit: 3 } : { limit: 3 });
      expect(response.status).toBe(200);
      pages.push({
        ids: response.body.data.map((message: { id: string }) => message.id),
        hasMore: response.body.meta.hasMore,
      });
      if (!response.body.meta.hasMore) break;
      before = response.body.meta.nextBefore;
      expect(before).toBe(response.body.data[0].id);
    }

    expect(pages.map(page => [page.ids.length, page.hasMore])).toEqual([[3, true], [3, true], [1, false]]);
    // Each page is ascending, and the pages joined back together are the thread.
    for (const page of pages) {
      expect(page.ids).toEqual(expected.filter(id => page.ids.includes(id)));
    }
    expect(pages.reverse().flatMap(page => page.ids)).toEqual(expected);
  });
}, 90000);
