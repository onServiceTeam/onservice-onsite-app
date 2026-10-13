// HA-M2-157 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, added by the review fix; critique L16 and the critique's P4
// change): when support reassigns a booking away from a provider and later
// back to them, that provider's own thread comes back open (state open, no
// reason, a new state-change time) instead of staying read-only, so the
// provider and the customer can message each other again on the job. No
// third thread is made, and the provider who was moved out in the second step
// is closed. Booking B starts paid and assigned to provider B with provider
// B's booked thread (helpers/reassign-postgres.ts); the time-overlap check is
// stubbed, as in the other reassign tests. Real reassign route on the guarded
// PostgreSQL fixture.
import * as matchingService from '../src/services/matching.service';
import { withReassignDatabase, reassignHttp, bookingBConversation } from './helpers/reassign-postgres';
import {
  bookingIntegrationIt as it, bookingB, customerB, providerA, providerB, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import { threadHttp } from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-157: reassigning a booking back to a provider reopens that provider\'s own thread', async () => {
  await withReassignDatabase(async database => {
    const overlap = jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
    try {
      expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
      const closedAt = (await database.query(`SELECT state, state_changed_at FROM conversations WHERE id = $1`,
        [bookingBConversation])).rows[0];
      expect(closedAt.state).toBe('read_only');
      await database.query(`UPDATE conversations SET state_changed_at = state_changed_at - INTERVAL '1 hour' WHERE id = $1`,
        [bookingBConversation]);
      expect((await reassignHttp()(bookingB, providerB)).status).toBe(200);
    } finally {
      overlap.mockRestore();
    }

    const threads = (await database.query(`SELECT id, provider_id, state, state_reason,
        state_changed_at > NOW() - INTERVAL '5 minutes' AS changed_now
        FROM conversations WHERE booking_id = $1 ORDER BY created_at, id`, [bookingB])).rows;
    expect(threads).toHaveLength(2);
    expect(threads.find(thread => thread.provider_id === providerUserB)).toEqual({
      id: bookingBConversation, provider_id: providerUserB, state: 'open', state_reason: null, changed_now: true,
    });
    expect(threads.find(thread => thread.provider_id === providerUserA)).toMatchObject({
      state: 'read_only', state_reason: 'provider_reassigned',
    });

    const provider = threadHttp(providerUserB, 'provider');
    expect((await provider.get(bookingBConversation)).body.data).toMatchObject({
      state: 'open', stateReason: null, stage: 'booking',
    });
    const sent = await provider.send(bookingBConversation, { content: 'Back on this job, see you tomorrow.' });
    expect(sent.status).toBe(201);
    expect((await threadHttp(customerB, 'customer').get(bookingBConversation)).body.data).toMatchObject({
      state: 'open', stage: 'booking', otherParty: { userId: providerUserB },
    });
  });
}, 90000);
