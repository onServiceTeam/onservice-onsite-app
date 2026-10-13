// HA-M2-126 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// a thread whose quote has expired reads read-only with reason
// quote_expired, both when the expiry worker has marked the quote 'expired'
// and when a submitted quote is past its expires_at before the worker runs.
// Real HTTP routes on the guarded PostgreSQL fixture with the real 185 schema.
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

it('HA-M2-126: an expired quote gives its thread the read-only reason quote_expired', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const customer = threadHttp(customerA, 'customer');
    expect((await customer.get(threadA)).body.data).toMatchObject({ state: 'open', stateReason: null });

    await database.query(`UPDATE booking_quotes SET status = 'expired', expires_at = NOW() - INTERVAL '1 minute'
      WHERE id = $1`, [quoteFromA]);
    await database.query(`UPDATE booking_quotes SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [quoteFromB]);

    expect((await customer.get(threadA)).body.data).toMatchObject({ state: 'read_only', stateReason: 'quote_expired' });
    expect((await customer.get(threadB)).body.data).toMatchObject({ state: 'read_only', stateReason: 'quote_expired' });
    expect((await customer.send(threadB, { content: 'Are you still coming?' })).body.error.code).toBe('THREAD_READ_ONLY');
  });
}, 90000);
