// HA-M3-90 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md 4.2; review finding on the M3-API build): GET
// /admin/marketplace-health/alerts lists open red alerts before amber ones,
// even when the amber was raised first, and meta.openRedCount counts the open
// red alerts (the admin banner turns red from it). An amber alert is raised
// on one sweep and a red alert for another request on the next. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-90: open red alerts are listed before amber ones and counted in openRedCount', async () => {
  await withMarketplaceDatabase(async database => {
    const amber = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });
    const red = await insertQuoteRequest(database, { roundOpenedAgo: '12 minutes' });
    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/alerts');

    expect(response.status).toBe(200);
    expect(response.body.data.map((alert: Record<string, unknown>) => [alert.bookingId, alert.kind, alert.severity]))
      .toEqual([
        [red, 'request_waiting_red', 'red'],
        [amber, 'request_waiting_amber', 'amber'],
      ]);
    expect(response.body.meta).toMatchObject({ openCount: 2, unacknowledgedCount: 2, openRedCount: 1 });
  });
}, 90000);
