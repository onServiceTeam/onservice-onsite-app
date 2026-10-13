// HA-M2-326 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I2;
// W3-A overflow number): when the customer declines a quote through the real
// decline route, that provider's request thread gets the customer's
// `quote_declined` system message with the reason label ("Declined the
// quote. Reason: Price too high.") and never the customer's free-text note,
// and the thread now reads read-only with reason quote_declined. Real HTTP
// (the provider's quote opens the thread, then the customer's decline) on the
// guarded PostgreSQL fixture with the real migrations 183, 184 and 185.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';
import { db } from '../src/models/db';
import { selectThreadsForBooking } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-326: a customer decline posts quote_declined with the reason label, never the note, and closes the thread', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id as string;

    const declined = await flowHttp(customerA, 'customer')
      .decline(bookingId, quoteId, { reason: 'too_expensive', note: 'Message me on viber 0917 555 0101 for a deal' });
    expect(declined.status).toBe(200);

    const [thread] = await selectThreadsForBooking(db, bookingId);
    expect([thread!.provider_id, thread!.effective_state, thread!.effective_state_reason])
      .toEqual([providerUserA, 'read_only', 'quote_declined']);
    const messages = (await database.query(`SELECT sender_id, system_event, content FROM messages
      WHERE conversation_id = $1 ORDER BY created_at, id`, [thread!.id])).rows;
    expect(messages).toEqual([
      { sender_id: providerUserA, system_event: 'quote_sent', content: 'Sent a quote. Open the quote to see the price and time.' },
      { sender_id: customerA, system_event: 'quote_declined', content: 'Declined the quote. Reason: Price too high.' },
    ]);
    expect(JSON.stringify(messages)).not.toContain('0917');
  }, { through: 185 });
}, 90000);
