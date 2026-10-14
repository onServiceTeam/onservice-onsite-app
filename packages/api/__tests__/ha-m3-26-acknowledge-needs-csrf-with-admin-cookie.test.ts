// HA-M3-26 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 103): the admin web signs in with the admin_session
// cookie, so acknowledging an alert with that cookie but without the
// X-CSRF-Token header is refused with 403 csrf_invalid and changes nothing;
// the same request with the matching header goes through. Real HTTP (real
// authentication and CSRF middleware) on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-26: acknowledging with the admin cookie but no CSRF header is refused with 403', async () => {
  await withMarketplaceDatabase(async database => {
    await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await sweepMarketplaceAlerts();
    const alertId = (await database.query<{ id: string }>('SELECT id FROM marketplace_alerts')).rows[0]!.id;
    // The admin's issued CSRF token, as admin sign-in stores it.
    await database.query(`INSERT INTO admin_csrf_tokens (admin_user_id, token, expires_at)
      VALUES ($1, 'synthetic-marketplace-csrf', NOW() + INTERVAL '1 hour')`, [adminUser]);
    const http = marketplaceAdminHttp(adminUser, 'admin');

    const refused = await http.cookiePost(`/alerts/${alertId}/acknowledge`, {});
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('csrf_invalid');
    expect((await database.query('SELECT acknowledged_at FROM marketplace_alerts')).rows).toEqual([{ acknowledged_at: null }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM admin_actions')).rows[0].n).toBe(0);

    const accepted = await http.cookiePost(`/alerts/${alertId}/acknowledge`, {}, 'synthetic-marketplace-csrf');
    expect(accepted.status).toBe(200);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM admin_actions')).rows[0].n).toBe(1);
  });
}, 90000);
