// HA-M2-158 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, added by the review fix): after support reassigns a booking, the
// closed thread and the new thread carry the same activity time (both are
// written in the reassignment's one transaction). The admin Communications
// list breaks that tie in favour of the booked provider's thread, so the
// "Conversation" link from Booking 360 and the Dispatch console (which opens
// /communications?bookingId= and picks the first match) lands on the live
// booked thread, not the old provider's read-only one. Booking B starts paid
// and assigned to provider B with provider B's booked thread
// (helpers/reassign-postgres.ts); the time-overlap check is stubbed. Real
// reassign route and real admin list route on the guarded PostgreSQL fixture.
import * as matchingService from '../src/services/matching.service';
import { withReassignDatabase, reassignHttp, bookingBConversation } from './helpers/reassign-postgres';
import {
  bookingIntegrationIt as it, bookingB, providerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import { adminHttp } from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-158: after a reassignment the admin conversation search lists the booked thread first', async () => {
  await withReassignDatabase(async () => {
    const overlap = jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
    try {
      expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
    } finally {
      overlap.mockRestore();
    }

    const listed = await adminHttp().get(`/conversations?search=${bookingB}`);
    expect(listed.status).toBe(200);
    const rows = listed.body.conversations as Array<Record<string, unknown>>;
    expect(rows.map(row => [row.providerId, row.stage, row.state])).toEqual([
      [providerUserA, 'booking', 'open'],
      [providerUserB, 'request', 'read_only'],
    ]);
    expect(rows[1]!.id).toBe(bookingBConversation);
    // The tie this ordering exists for: one activity time on both threads.
    expect(rows[0]!.updatedAt).toBe(rows[1]!.updatedAt);
  });
}, 90000);
