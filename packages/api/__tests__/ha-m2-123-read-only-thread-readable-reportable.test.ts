// HA-M2-123 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// a read-only thread (quote declined) can still be opened and read, by
// cursor and by the old page/pageSize call, and a message in it can still be
// reported to the moderation team. Real HTTP routes on the guarded
// PostgreSQL fixture with the real 185 schema.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  insertMessage, quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-123: a read-only thread is still readable and its messages can be reported', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const offending = await insertMessage(database, threadA, providerUserA, 'Pay me direct on gcash, cheaper.');
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'other',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);
    const customer = threadHttp(customerA, 'customer');

    const view = await customer.get(threadA);
    const page = await customer.messages(threadA, { limit: 30 });
    const legacyPage = await customer.messages(threadA, { page: 1, pageSize: 50 });
    const report = await customer.report(offending, 'Asked me to pay outside the app.');

    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ id: threadA, state: 'read_only', stateReason: 'quote_declined', stage: 'request' });
    expect(page.status).toBe(200);
    expect(page.body.meta.conversation).toEqual({ id: threadA, state: 'read_only', stateReason: 'quote_declined' });
    expect(page.body.data.map((message: { content: string }) => message.content)).toEqual([
      'Sent a quote. Open the quote to see the price and time.',
      'Pay me direct on gcash, cheaper.',
    ]);
    expect(legacyPage.status).toBe(200);
    expect(legacyPage.body.data).toHaveLength(2);
    expect(report.status).toBe(200);
    expect(report.body.data).toEqual({ reported: true });
    expect((await database.query(`SELECT reported_by, report_reason, is_flagged, reported_at IS NOT NULL AS reported
        FROM messages WHERE id = $1`, [offending])).rows).toEqual([{
      reported_by: customerA, report_reason: 'Asked me to pay outside the app.', is_flagged: true, reported: true,
    }]);
  });
}, 90000);
