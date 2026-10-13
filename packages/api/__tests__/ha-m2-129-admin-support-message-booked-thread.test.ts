// HA-M2-129 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// an admin support message on a booking with several threads lands in the
// booked provider's thread only. It neither creates another thread nor moves
// or touches the other provider's request thread. The real admin route
// POST /api/v1/admin/bookings/:id/message on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, operatorId, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import { tableColumns, tableRows } from './helpers/request-engine-postgres';
import {
  adminHttp, bookProviderA, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-129: an admin support message lands in the booked thread, not a sibling thread', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    // Provider B's thread is the older one, so a booking-wide pick would find it first.
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    await bookProviderA(database);
    const columns = await tableColumns(database, 'conversations');
    const threadBBefore = await tableRows(database, 'conversations', columns, `id = '${threadB}'`);
    const threadBMessagesBefore = (await database.query('SELECT id FROM messages WHERE conversation_id = $1 ORDER BY id',
      [threadB])).rows;

    const response = await adminHttp().post(`/bookings/${requestBooking}/message`, {
      message: 'onService support will call you both to confirm the visit time.',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      customerId: customerA, providerUserId: providerUserA, conversationId: threadA,
    });
    expect((await database.query(`SELECT conversation_id, sender_id, content, message_type FROM messages
        WHERE sender_id = $1`, [operatorId])).rows).toEqual([{
      conversation_id: threadA, sender_id: operatorId, message_type: 'system',
      content: 'onService support will call you both to confirm the visit time.',
    }]);
    expect((await database.query('SELECT id, provider_id FROM conversations WHERE booking_id = $1 ORDER BY created_at',
      [requestBooking])).rows).toEqual([{ id: threadB, provider_id: providerUserB }, { id: threadA, provider_id: providerUserA }]);
    expect(await tableRows(database, 'conversations', columns, `id = '${threadB}'`)).toEqual(threadBBefore);
    expect((await database.query('SELECT id FROM messages WHERE conversation_id = $1 ORDER BY id', [threadB])).rows)
      .toEqual(threadBMessagesBefore);
  });
}, 90000);
