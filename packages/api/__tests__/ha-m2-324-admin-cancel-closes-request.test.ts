// HA-M2-324 (customer human audit 2026-10-13, D38 Milestone 2, critique M12;
// W3-A overflow number): when the super admin cancels an open quote request
// (POST /admin/bookings/:id/cancel), the request is closed the way a customer
// cancel closes it, but silently. The open invite of the provider who was
// told about it and has not quoted expires, and both that provider and the
// provider holding a live quote get `job_request:closed`, so the request
// leaves their lists. Nobody gets a push or a notification: the only stored
// notice says "The customer cancelled their request...", which is untrue for
// an admin cancel, and the admin-cancel wording is held for Ken (D35 Q6,
// escalation E84). The customer cancel keeps its notice (HA-M2-301). Real
// admin route (behind the real authentication middleware) and a real
// Socket.IO server on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuote, insertQuoteRequest, invitesOf, listenAs, waitUntil,
  providerA, providerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { adminCancelHttp } from './helpers/booking-admin-cancel-postgres';
import { REALTIME_EVENTS } from '../src/services/realtime-events';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-324: an admin cancel closes the open quote request without the customer-cancelled notice', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted' });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status, responded_at, quote_id)
      VALUES ($1, $2, 1, 'push', 'quoted', NOW(), $3), ($1, $4, 1, 'push', 'sent', NULL, NULL)`,
    [bookingId, providerA, quoteId, providerB]);
    const sockets = await listenAs([
      { userId: providerUserA, role: 'provider' }, { userId: providerUserB, role: 'provider' },
    ]);
    try {
      const cancelled = await adminCancelHttp()(bookingId);

      expect(cancelled.status).toBe(200);
      const closedEvents = (userId: string) => sockets.events.get(userId)!
        .filter(e => e.event === REALTIME_EVENTS.JOB_REQUEST_CLOSED).map(e => e.payload);
      await waitUntil(async () => closedEvents(providerUserA).length > 0 && closedEvents(providerUserB).length > 0,
        'job_request:closed to both providers');
      expect(closedEvents(providerUserA)).toEqual([{ bookingId, reason: 'cancelled' }]);
      expect(closedEvents(providerUserB)).toEqual([{ bookingId, reason: 'cancelled' }]);
      expect((await database.query('SELECT status FROM bookings WHERE id = $1', [bookingId])).rows)
        .toEqual([{ status: 'cancelled_by_admin' }]);
      expect((await invitesOf(database, bookingId)).map(i => [i.provider_id, i.status]))
        .toEqual([[providerA, 'quoted'], [providerB, 'expired']]);
      expect((await database.query(`SELECT user_id, type, body FROM notifications WHERE user_id = ANY($1::uuid[])`,
        [[providerUserA, providerUserB]])).rows).toEqual([]);
    } finally {
      await sockets.close();
    }
  });
}, 90000);
