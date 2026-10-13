// HA-M2-75 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I2): a
// quote that is admitted opens the request thread between the customer and
// that provider, with the provider's `quote_sent` system message ("Sent a
// quote...", no price), and the customer's quote card carries that thread's
// conversationId and the provider's user id, which is what the card's
// Message button opens. Real HTTP (the provider's quote and the customer's
// quote list) on the guarded PostgreSQL fixture with the real migrations
// 183, 184 and 185.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-75: quote admission opens a thread with quote_sent that the quote card links to', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const quoted = await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect(quoted.status).toBe(201);

    const threads = (await database.query(`SELECT id, customer_id, provider_id, opened_by_quote_id
      FROM conversations WHERE booking_id = $1`, [bookingId])).rows;
    expect(threads).toEqual([{
      id: expect.any(String), customer_id: customerA, provider_id: providerUserA, opened_by_quote_id: quoted.body.data.id,
    }]);
    const conversationId = threads[0].id as string;
    expect((await database.query(`SELECT sender_id, message_type, system_event, content FROM messages
      WHERE conversation_id = $1`, [conversationId])).rows).toEqual([{
      sender_id: providerUserA, message_type: 'system', system_event: 'quote_sent',
      content: 'Sent a quote. Open the quote to see the price and time.',
    }]);
    const card = (await flowHttp(customerA, 'customer').quotes(bookingId)).body.data[0];
    expect(card).toMatchObject({ id: quoted.body.data.id, conversationId, providerUserId: providerUserA });
  }, { through: 185 });
}, 90000);
