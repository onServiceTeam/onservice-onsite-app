// HA-M2-150 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, not numbered in merged.md section 4): the admin Communications
// list and thread view show each request thread's derived state, read-only
// reason and stage, and thread messages carry their system event, so support
// can tell an open request thread from a declined one. Opening a thread is
// still recorded as conversation_viewed. Real admin routes on the guarded
// PostgreSQL fixture.
import {
  bookingIntegrationIt as it, operatorId,
} from './helpers/booking-participant-postgres';
import {
  adminHttp, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-150: admin Communications shows each thread\'s state, reason and stage', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive',
        declined_at = NOW() WHERE id = $1`, [quoteFromB]);
    const admin = adminHttp();

    const list = await admin.get('/conversations');
    const thread = await admin.get(`/conversations/${threadB}`);

    expect(list.status).toBe(200);
    const rows = list.body.conversations as Array<Record<string, unknown>>;
    expect(rows.map(row => [row.id, row.state, row.stateReason, row.stage]).sort()).toEqual([
      [threadA, 'open', null, 'request'],
      [threadB, 'read_only', 'quote_declined', 'request'],
    ].sort());
    expect(thread.status).toBe(200);
    expect(thread.body.data).toMatchObject({ id: threadB, state: 'read_only', stateReason: 'quote_declined', stage: 'request' });
    expect(thread.body.data.messages.map((message: { systemEvent: string | null; messageType: string }) => (
      [message.messageType, message.systemEvent]))).toEqual([['system', 'quote_sent']]);
    expect((await database.query(`SELECT admin_id, details->>'conversationId' AS conversation_id FROM admin_actions
        WHERE action_type = 'conversation_viewed'`)).rows).toEqual([{ admin_id: operatorId, conversation_id: threadB }]);
  });
}, 90000);
