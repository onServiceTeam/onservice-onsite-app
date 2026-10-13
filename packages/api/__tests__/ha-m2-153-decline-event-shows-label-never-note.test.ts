// HA-M2-153 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, not numbered in merged.md section 4): postQuoteEvent, the hook P2
// calls after a decline commits, posts one system message from the customer
// with the decline reason's label and never the customer's private note, and
// a second call adds nothing. The provider then reads the thread as read-only
// (quote_declined). Real HTTP read on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread, postQuoteEvent } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-153: a decline posts the reason label once and never the customer\'s note', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'timing',
        decline_note = 'He could only come next week, too late for me', declined_at = NOW() WHERE id = $1`, [quoteFromA]);

    const first = await postQuoteEvent({ bookingId: requestBooking, quoteId: quoteFromA, event: 'quote_declined', declineReason: 'timing' });
    const second = await postQuoteEvent({ bookingId: requestBooking, quoteId: quoteFromA, event: 'quote_declined', declineReason: 'timing' });

    expect([first, second]).toEqual([true, false]);
    const page = await threadHttp(providerUserA, 'provider').messages(threadA, { limit: 30 });
    expect(page.body.meta.conversation).toEqual({ id: threadA, state: 'read_only', stateReason: 'quote_declined' });
    expect(page.body.data.map((message: { senderId: string; systemEvent: string; content: string }) => (
      [message.senderId, message.systemEvent, message.content]))).toEqual([
      [providerUserA, 'quote_sent', 'Sent a quote. Open the quote to see the price and time.'],
      [customerA, 'quote_declined', 'Declined the quote. Reason: Timing did not work.'],
    ]);
    expect(JSON.stringify(page.body)).not.toContain('next week');
  });
}, 90000);
