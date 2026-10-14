// HA-M3-25 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// E34): the DPO role is not an operations role, so POST
// /admin/marketplace-health/alerts/:id/acknowledge refuses a signed-in dpo
// with 403 and changes nothing: the alert stays unacknowledged and no audit
// row is written. Real HTTP (real authentication and role check) on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { dpoUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-25: a dpo cannot acknowledge an alert', async () => {
  await withMarketplaceDatabase(async database => {
    await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await sweepMarketplaceAlerts();
    const alertId = (await database.query<{ id: string }>('SELECT id FROM marketplace_alerts')).rows[0]!.id;

    const response = await marketplaceAdminHttp(dpoUser, 'dpo').post(`/alerts/${alertId}/acknowledge`, { note: 'Taking it' });

    expect(response.status).toBe(403);
    expect((await database.query('SELECT acknowledged_at, acknowledged_by FROM marketplace_alerts')).rows)
      .toEqual([{ acknowledged_at: null, acknowledged_by: null }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM admin_actions')).rows[0].n).toBe(0);
  });
}, 90000);
