// HA-M3-38 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 100; E34): the marketplace insights are for the
// operations roles only. GET /admin/marketplace-health/open-requests answers
// admin and super_admin with 200, refuses dpo, provider and customer accounts
// with 403 and an anonymous caller with 401, and no refused caller sees any
// request data. Real HTTP (real authentication and role check) on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { customerA, insertQuoteRequest, providerUserA } from './helpers/request-flow-postgres';
import {
  adminUser, dpoUser, marketplaceAdminHttp, superAdminUser, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-38: open-requests is 200 for admin and super_admin and 403 for dpo, provider and customer', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    const status = async (userId: string, role: string) => {
      const response = await marketplaceAdminHttp(userId, role).get('/open-requests');
      return { status: response.status, leaked: JSON.stringify(response.body).includes(bookingId) };
    };

    expect(await status(adminUser, 'admin')).toEqual({ status: 200, leaked: true });
    expect(await status(superAdminUser, 'super_admin')).toEqual({ status: 200, leaked: true });
    expect(await status(dpoUser, 'dpo')).toEqual({ status: 403, leaked: false });
    expect(await status(providerUserA, 'provider')).toEqual({ status: 403, leaked: false });
    expect(await status(customerA, 'customer')).toEqual({ status: 403, leaked: false });
    const anonymous = await marketplaceAdminHttp(adminUser, 'admin').anonymousGet('/open-requests');
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toContain(bookingId);
  });
}, 90000);
