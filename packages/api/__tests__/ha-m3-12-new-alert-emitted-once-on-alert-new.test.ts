// HA-M3-12 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 77): each new alert is announced exactly once on the
// existing admin event alert:new (ADMIN_EVENTS.ALERT_NEW, so the admin event
// list keeps its 10 names), to the admin:global room only. A real Socket.IO
// server (the production initSocketServer and handshake) has an admin and a
// provider connected: a sweep that raises an alert sends it to the admin
// once, a repeat sweep sends nothing more, the next new alert arrives after
// it, and the provider receives none of them. Real SQL on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest, listenAs, providerUserA, waitUntil } from './helpers/request-flow-postgres';
import { adminUser, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';
import { ADMIN_EVENTS } from '../src/services/socket.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-12: a new alert is emitted once on the existing alert:new admin event, to admins only', async () => {
  expect(Object.keys(ADMIN_EVENTS)).toHaveLength(10);
  expect(ADMIN_EVENTS.ALERT_NEW).toBe('alert:new');

  await withMarketplaceDatabase(async database => {
    const sockets = await listenAs([{ userId: adminUser, role: 'admin' }, { userId: providerUserA, role: 'provider' }]);
    try {
      const first = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
      const alertNew = () => sockets.events.get(adminUser)!.filter(event => event.event === 'alert:new');

      await sweepMarketplaceAlerts();
      await waitUntil(async () => alertNew().length === 1, 'the first alert:new');
      await sweepMarketplaceAlerts();
      const second = await insertQuoteRequest(database, { roundOpenedAgo: '11 minutes' });
      await sweepMarketplaceAlerts();
      await waitUntil(async () => alertNew().length >= 2, 'the second alert:new');

      const alertIds = (await database.query<{ id: string; booking_id: string }>(
        'SELECT id, booking_id FROM marketplace_alerts ORDER BY raised_at, booking_id',
      )).rows;
      expect(alertNew().map(event => event.payload)).toEqual([
        {
          id: alertIds.find(row => row.booking_id === first)!.id, source: 'marketplace',
          kind: 'request_waiting_amber', severity: 'amber', bookingId: first, round: 1, raisedAt: expect.any(String),
        },
        {
          id: alertIds.find(row => row.booking_id === second)!.id, source: 'marketplace',
          kind: 'request_waiting_red', severity: 'red', bookingId: second, round: 1, raisedAt: expect.any(String),
        },
      ]);
      expect(sockets.events.get(providerUserA)!.filter(event => event.event === 'alert:new')).toEqual([]);
    } finally {
      await sockets.close();
    }
  });
}, 90000);
