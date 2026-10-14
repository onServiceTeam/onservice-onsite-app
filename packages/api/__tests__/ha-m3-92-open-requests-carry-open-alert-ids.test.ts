// HA-M3-92 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md 4.1; review finding on the M3-API build): each request in
// the Waiting now queue carries the ids of its open alerts, so the page can
// link a row to the alert an admin acknowledges. After a sweep, the request
// waiting 6 minutes lists its amber alert's id; the request waiting 3
// minutes has none. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-92: open requests list the ids of their open alerts', async () => {
  await withMarketplaceDatabase(async database => {
    const alerted = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    const fresh = await insertQuoteRequest(database, { roundOpenedAgo: '3 minutes' });
    await sweepMarketplaceAlerts();
    const alertId = (await database.query<{ id: string }>('SELECT id FROM marketplace_alerts WHERE booking_id = $1', [alerted]))
      .rows[0]!.id;

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/open-requests');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: Record<string, unknown>) => [row.bookingId, row.openAlertIds])).toEqual([
      [alerted, [alertId]],
      [fresh, []],
    ]);
  });
}, 90000);
