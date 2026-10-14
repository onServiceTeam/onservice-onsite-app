// HA-M3-83 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): GET /admin/marketplace-health/providers
// reports the real number of providers in meta.total on every page, including
// a page past the last one. Providers A and B each had an invite in the
// range; with one provider per page, page 1 and page 3 both report a total of
// 2 (page 3 has no rows), so an admin left on a page that no longer exists
// can still see and page back to the providers that do. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest, providerA, providerB } from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-83: the providers total is the real count even on a page past the last one', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '40 minutes' });
    await insertInvite(database, { bookingId, providerId: providerA, sentAgo: '40 minutes' });
    await insertInvite(database, { bookingId, providerId: providerB, sentAgo: '40 minutes' });
    const http = marketplaceAdminHttp(adminUser, 'admin');

    const first = await http.get('/providers?pageSize=1&page=1');
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.meta).toMatchObject({ total: 2, page: 1, pageSize: 1 });

    const pastTheEnd = await http.get('/providers?pageSize=1&page=3');
    expect(pastTheEnd.status).toBe(200);
    expect(pastTheEnd.body.data).toEqual([]);
    expect(pastTheEnd.body.meta).toMatchObject({ total: 2, page: 3, pageSize: 1 });
  });
}, 90000);
