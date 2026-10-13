// HA-M2-156 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, added by the review fix): the retry key a hook gives its system
// message ("Declined the quote.", "Sent a quote.") and the clientMessageId a
// participant sends live in separate unique rules (migration 185). The system
// keys are deterministic and a participant can work them out from ids they
// already see, so before the fix a participant who sent a message with that
// id made the hook's system message silently disappear, and a participant
// who reused a stored system key got the system message back as their own
// "duplicate". Now neither can affect the other. Real HTTP sends and the real
// hook on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread, postQuoteEvent, systemMessageKey } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-156: a participant clientMessageId and a system message key never collide', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;

    // The customer sends first, using the key the decline notice will use.
    const presend = await threadHttp(customerA, 'customer').send(threadA, {
      content: 'Hello, is this still available?', clientMessageId: systemMessageKey('quote_declined', quoteFromA),
    });
    expect(presend.status).toBe(201);
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);
    expect(await postQuoteEvent({
      bookingId: requestBooking, quoteId: quoteFromA, event: 'quote_declined', declineReason: 'too_expensive',
    })).toBe(true);
    expect((await database.query(`SELECT sender_id, message_type, system_event, content FROM messages
        WHERE conversation_id = $1 AND sender_id = $2 ORDER BY created_at, id`, [threadA, customerA])).rows).toEqual([
      { sender_id: customerA, message_type: 'text', system_event: null, content: 'Hello, is this still available?' },
      { sender_id: customerA, message_type: 'system', system_event: 'quote_declined', content: 'Declined the quote. Reason: Price too high.' },
    ]);

    // Provider B reuses the key of the quote_sent notice already in their thread:
    // it is stored as their own new message, not answered with the notice.
    const reuse = await threadHttp(providerUserB, 'provider').send(threadB, {
      content: 'I can start on Monday.', clientMessageId: systemMessageKey('quote_sent', quoteFromB),
    });
    expect(reuse.status).toBe(201);
    expect(reuse.body.data).toMatchObject({ content: 'I can start on Monday.', messageType: 'text', systemEvent: null });
    expect(reuse.body.data.duplicate).toBeUndefined();
    expect((await database.query(`SELECT message_type, system_event FROM messages
        WHERE conversation_id = $1 ORDER BY created_at, id`, [threadB])).rows).toEqual([
      { message_type: 'system', system_event: 'quote_sent' },
      { message_type: 'text', system_event: null },
    ]);
  });
}, 90000);
