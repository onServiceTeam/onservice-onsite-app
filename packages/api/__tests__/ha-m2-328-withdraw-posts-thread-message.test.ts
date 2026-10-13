// HA-M2-328 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I2;
// W3-A overflow number): when a provider withdraws their quote through the
// real withdraw route (critique M13), their request thread gets the
// provider's `quote_withdrawn` system message ("Withdrew the quote.") and
// then reads read-only with reason quote_withdrawn. Real HTTP (the quote
// opens the thread, then the withdrawal) on the guarded PostgreSQL fixture
// with the real migrations 183, 184 and 185.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA,
} from './helpers/request-flow-postgres';
import { db } from '../src/models/db';
import { selectThreadsForBooking } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-328: a withdrawn quote posts quote_withdrawn in its thread', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const provider = flowHttp(providerUserA, 'provider');
    const quoteId = (await provider.quote(bookingId)).body.data.id as string;

    expect((await provider.withdraw(bookingId, quoteId)).status).toBe(200);

    const [thread] = await selectThreadsForBooking(db, bookingId);
    expect([thread!.provider_id, thread!.effective_state, thread!.effective_state_reason])
      .toEqual([providerUserA, 'read_only', 'quote_withdrawn']);
    expect((await database.query(`SELECT sender_id, system_event, content FROM messages
      WHERE conversation_id = $1 ORDER BY created_at, id`, [thread!.id])).rows).toEqual([
      { sender_id: providerUserA, system_event: 'quote_sent', content: 'Sent a quote. Open the quote to see the price and time.' },
      { sender_id: providerUserA, system_event: 'quote_withdrawn', content: 'Withdrew the quote.' },
    ]);
  }, { through: 185 });
}, 90000);
