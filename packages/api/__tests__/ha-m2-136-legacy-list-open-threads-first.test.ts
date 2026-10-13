// HA-M2-136 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the legacy conversation list (GET /api/v1/conversations with no view) puts
// open threads before read-only ones, even when the read-only thread had the
// latest message. Old apps (1.0.2, 1.0.3) pick "the" chat for a booking with
// find(c => c.bookingId === id), so they land on the open thread. Real HTTP
// route on the guarded PostgreSQL fixture with the real 185 schema.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  insertMessage, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-136: the legacy conversation list puts open threads first', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    await database.query(`UPDATE conversations SET updated_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [threadB]);
    // Thread A has the latest activity, then its quote is declined.
    await insertMessage(database, threadA, providerUserA, 'Final offer: 1,700.');
    await database.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [threadA]);
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);

    const response = await threadHttp(customerA, 'customer').list();

    expect(response.status).toBe(200);
    const rows = response.body.data as Array<Record<string, unknown>>;
    expect(rows.map(row => [row.id, row.state, row.stateReason])).toEqual([
      [threadB, 'open', null],
      [threadA, 'read_only', 'quote_declined'],
    ]);
    // The old fields old apps read are all still there.
    expect(Object.keys(rows[0]!)).toEqual(expect.arrayContaining([
      'id', 'bookingId', 'customerId', 'providerId', 'isActive', 'createdAt', 'updatedAt',
    ]));
    expect(rows.find(row => row.bookingId === requestBooking)!.id).toBe(threadB);
  });
}, 90000);
