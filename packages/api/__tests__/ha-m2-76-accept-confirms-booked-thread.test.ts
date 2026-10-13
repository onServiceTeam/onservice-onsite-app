// HA-M2-76 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I2):
// when the customer accepts one of two quotes, the chosen provider's thread
// gets the customer's `booking_confirmed` system message and stays open as
// the booking thread, and the other provider's thread now reads read-only
// with reason other_provider_booked (derived from the booking; nothing is
// written to that thread). Compare mode (request_max_open_quotes 5) so both
// providers quote. Real HTTP for the quotes and the accept; thread state read
// through the production THREAD_STATE_SQL on the guarded PostgreSQL fixture
// with the real migrations 183, 184 and 185.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, upsertPlatformSetting, quoteBody,
  customerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { db } from '../src/models/db';
import { selectThreadsForBooking } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-76: accept posts booking_confirmed in the booked thread and the sibling thread reads read-only', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    const bookingId = await insertQuoteRequest(database);
    const quoteA = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id as string;
    expect((await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody({ quotedPrice: 95000 }))).status).toBe(201);

    expect((await flowHttp(customerA, 'customer').accept(bookingId, quoteA)).status).toBe(200);

    const threads = await selectThreadsForBooking(db, bookingId);
    const threadOf = (userId: string) => threads.find(t => t.provider_id === userId)!;
    expect([threadOf(providerUserA), threadOf(providerUserB)].map(t => [t.effective_state, t.effective_state_reason, t.stage]))
      .toEqual([['open', null, 'booking'], ['read_only', 'other_provider_booked', 'request']]);
    const messagesIn = async (conversationId: string) => (await database.query(`SELECT sender_id, system_event
      FROM messages WHERE conversation_id = $1 ORDER BY created_at, id`, [conversationId])).rows;
    expect(await messagesIn(threadOf(providerUserA).id)).toEqual([
      { sender_id: providerUserA, system_event: 'quote_sent' },
      { sender_id: customerA, system_event: 'booking_confirmed' },
    ]);
    expect(await messagesIn(threadOf(providerUserB).id)).toEqual([{ sender_id: providerUserB, system_event: 'quote_sent' }]);
    expect((await database.query('SELECT state FROM conversations WHERE id = $1', [threadOf(providerUserB).id])).rows)
      .toEqual([{ state: 'open' }]);
  }, { through: 185 });
}, 90000);
