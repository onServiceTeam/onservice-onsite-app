// HA-M3-24 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 88): acknowledging a request_unfilled alert resolves
// it (resolution 'acknowledged'), because nothing else can; acknowledging a
// waiting alert does not, because the request is still waiting. GET
// /admin/marketplace-health/alerts then lists only the waiting alert, marked
// as acknowledged, with an open count of 1 and nothing unacknowledged. Real
// HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import {
  adminUser, closeAsExpired, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-24: acknowledging resolves an unfilled alert but leaves a waiting alert open', async () => {
  await withMarketplaceDatabase(async database => {
    const waiting = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    const unfilled = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    await closeAsExpired(database, unfilled);
    await sweepMarketplaceAlerts();
    const ids = Object.fromEntries((await database.query<{ id: string; booking_id: string }>(
      'SELECT id, booking_id FROM marketplace_alerts',
    )).rows.map(row => [row.booking_id, row.id]));
    const http = marketplaceAdminHttp(adminUser, 'admin');

    expect((await http.post(`/alerts/${ids[unfilled]}/acknowledge`)).status).toBe(200);
    expect((await http.post(`/alerts/${ids[waiting]}/acknowledge`)).status).toBe(200);

    expect((await database.query(`SELECT kind, resolution, resolved_at IS NULL AS open FROM marketplace_alerts
      ORDER BY kind`)).rows).toEqual([
      { kind: 'request_unfilled', resolution: 'acknowledged', open: false },
      { kind: 'request_waiting_amber', resolution: null, open: true },
    ]);
    const open = await http.get('/alerts');
    expect(open.status).toBe(200);
    expect(open.body.data.map((alert: Record<string, unknown>) => [alert.bookingId, alert.kind, alert.acknowledgedAt !== null]))
      .toEqual([[waiting, 'request_waiting_amber', true]]);
    expect(open.body.meta).toMatchObject({ openCount: 1, unacknowledgedCount: 0, openRedCount: 0 });
  });
}, 90000);
