// HA-M2-24 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// when a quote fills the request's last open-quote place, every open invite
// (sent or viewed) becomes 'taken', and `job_request:closed {reason: 'taken'}`
// reaches exactly those invited providers: not the provider who quoted, and
// not an eligible provider who was never invited. Real HTTP and a real
// Socket.IO server (production handshake) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, addProvider, listenAs, invitesOf,
  providerA, providerB, providerC, providerD, providerUserA, providerUserB, providerUserC, providerUserD,
} from './helpers/request-flow-postgres';
import { REALTIME_EVENTS } from '../src/services/realtime-events';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-24: at the cap, open invites become taken and job_request:closed reaches only those invitees', async () => {
  await withRequestFlowDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    await addProvider(database, { providerId: providerD, userId: providerUserD });
    const bookingId = await insertQuoteRequest(database);
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status, viewed_at)
      VALUES ($1, $2, 1, 'push', 'sent', NULL), ($1, $3, 1, 'push', 'viewed', NOW()), ($1, $4, 1, 'push', 'sent', NULL)`,
    [bookingId, providerA, providerB, providerC]);
    const sockets = await listenAs([
      { userId: providerUserA, role: 'provider' }, { userId: providerUserB, role: 'provider' },
      { userId: providerUserC, role: 'provider' }, { userId: providerUserD, role: 'provider' },
    ]);
    try {
      expect((await flowHttp(providerUserA, 'provider').quote(bookingId)).status).toBe(201);
      await new Promise(resolve => setTimeout(resolve, 300));

      const closedTo = (userId: string) => sockets.events.get(userId)!
        .filter(e => e.event === REALTIME_EVENTS.JOB_REQUEST_CLOSED).map(e => e.payload);
      expect(closedTo(providerUserB)).toEqual([{ bookingId, reason: 'taken' }]);
      expect(closedTo(providerUserC)).toEqual([{ bookingId, reason: 'taken' }]);
      expect(closedTo(providerUserA)).toEqual([]);
      expect(closedTo(providerUserD)).toEqual([]);
    } finally {
      await sockets.close();
    }
    const invites = await invitesOf(database, bookingId);
    expect(invites.map(i => [i.provider_id, i.status])).toEqual([
      [providerA, 'quoted'], [providerB, 'taken'], [providerC, 'taken'],
    ]);
  });
}, 90000);
