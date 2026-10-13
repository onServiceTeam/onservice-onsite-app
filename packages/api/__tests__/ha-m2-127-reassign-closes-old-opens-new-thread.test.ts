// HA-M2-127 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the super admin's real reassign route closes the old provider's thread
// (stored read-only, reason provider_reassigned, history kept, with a system
// notice) and opens a new thread for the new provider in the same step,
// recorded on the booking_reassigned audit row. Booking B starts paid and
// assigned to provider B with provider B's booked thread
// (helpers/reassign-postgres.ts). The time-overlap check is stubbed, as in the
// other reassign tests.
import * as matchingService from '../src/services/matching.service';
import { withReassignDatabase, reassignHttp, bookingBConversation } from './helpers/reassign-postgres';
import {
  bookingIntegrationIt as it, bookingB, customerB, operatorId, providerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import { insertMessage, threadHttp } from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-127: reassignment closes the old provider\'s thread and opens a new one for the new provider', async () => {
  await withReassignDatabase(async database => {
    await insertMessage(database, bookingBConversation, customerB, 'Please bring a ladder.');
    await insertMessage(database, bookingBConversation, providerUserB, 'Will do, see you at 9.');
    const overlap = jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
    try {
      expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
    } finally {
      overlap.mockRestore();
    }

    const threads = (await database.query(`SELECT id, customer_id, provider_id, state, state_reason,
        state_changed_at IS NOT NULL AS state_changed FROM conversations WHERE booking_id = $1 ORDER BY created_at`,
    [bookingB])).rows;
    expect(threads).toHaveLength(2);
    expect(threads[0]).toEqual({
      id: bookingBConversation, customer_id: customerB, provider_id: providerUserB,
      state: 'read_only', state_reason: 'provider_reassigned', state_changed: true,
    });
    expect(threads[1]).toMatchObject({
      customer_id: customerB, provider_id: providerUserA, state: 'open', state_reason: null,
    });
    const newThread = threads[1].id as string;

    expect((await database.query(`SELECT conversation_id, sender_id, message_type, system_event FROM messages
        WHERE system_event IS NOT NULL ORDER BY created_at`)).rows).toEqual([
      { conversation_id: bookingBConversation, sender_id: operatorId, message_type: 'system', system_event: 'provider_reassigned_out' },
      { conversation_id: newThread, sender_id: operatorId, message_type: 'system', system_event: 'provider_reassigned_in' },
    ]);
    // The old history stays in the old thread.
    expect((await database.query(`SELECT COUNT(*)::int AS count FROM messages
        WHERE conversation_id = $1 AND system_event IS NULL`, [bookingBConversation])).rows).toEqual([{ count: 2 }]);
    expect((await database.query(`SELECT details->>'oldConversationId' AS old_id, details->>'oldConversationClosed' AS closed,
        details->>'newConversationId' AS new_id FROM admin_actions WHERE action_type = 'booking_reassigned'`)).rows)
      .toEqual([{ old_id: bookingBConversation, closed: 'true', new_id: newThread }]);

    // The old provider can still read it, read-only, and can no longer write.
    const oldProvider = threadHttp(providerUserB, 'provider');
    expect((await oldProvider.get(bookingBConversation)).body.data).toMatchObject({
      state: 'read_only', stateReason: 'provider_reassigned', stage: 'request',
    });
    expect((await oldProvider.send(bookingBConversation, { content: 'Why was I removed?' })).body.error.code)
      .toBe('THREAD_READ_ONLY');
    expect((await threadHttp(customerB, 'customer').get(newThread)).body.data).toMatchObject({
      state: 'open', stage: 'booking', otherParty: { userId: providerUserA, displayName: 'Ben S.' },
    });
  });
}, 90000);
