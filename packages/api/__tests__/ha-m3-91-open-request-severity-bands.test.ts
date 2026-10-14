// HA-M3-91 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md 4.1; review finding on the M3-API build): each request in
// the Waiting now queue (GET /admin/marketplace-health/open-requests) carries
// a severity from the alert settings (amber 5, red 10 minutes): waits of 3
// minutes have none, 5 and 9 minutes are amber, 10 minutes is red. Real HTTP
// on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-91: open requests are none under 5 minutes, amber from 5 and red from 10', async () => {
  await withMarketplaceDatabase(async database => {
    for (const minutes of [3, 5, 9, 10]) await insertQuoteRequest(database, { roundOpenedAgo: `${minutes} minutes` });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/open-requests');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: Record<string, unknown>) => [row.waitMinutes, row.severity])).toEqual([
      [10, 'red'],
      [9, 'amber'],
      [5, 'amber'],
      [3, 'none'],
    ]);
  });
}, 90000);
