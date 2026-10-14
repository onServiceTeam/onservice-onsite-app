// HA-M2-355 (customer human audit 2026-10-13, D38 Milestone 2; P5b review
// finding 4, server side): when a request round actually reaches providers,
// the customer's open request status screen is told to re-read
// ("request:updated") right away, so "We sent your request to N local pros"
// shows the real count instead of 0 until the app's fallback re-reads.
// Overflow number 355 (free when written). Real Socket.IO server on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, listenAs, invitesOf,
  customerA, providerUserA,
} from './helpers/request-flow-postgres';
import { REALTIME_EVENTS } from '../src/services/realtime-events';
import { fanOutRequest } from '../src/services/job-request-events.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-355: a fan-out that notified providers sends request:updated to the customer', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const sockets = await listenAs([
      { userId: customerA, role: 'customer' }, { userId: providerUserA, role: 'provider' },
    ]);
    try {
      const result = await fanOutRequest(bookingId, { round: 1, customerId: customerA });
      expect(result?.notified).toBeGreaterThan(0);
      expect((await invitesOf(database, bookingId)).length).toBeGreaterThan(0);
      await new Promise(resolve => setTimeout(resolve, 300));

      const updates = sockets.events.get(customerA)!.filter(e => e.event === REALTIME_EVENTS.REQUEST_UPDATED);
      expect(updates).toHaveLength(1);
      expect(updates[0]!.payload).toMatchObject({ bookingId, status: 'requested', round: 1, opsReview: false });
      // The provider never receives the customer-only event.
      expect(sockets.events.get(providerUserA)!.filter(e => e.event === REALTIME_EVENTS.REQUEST_UPDATED)).toEqual([]);
    } finally {
      await sockets.close();
    }
  });
}, 90000);
