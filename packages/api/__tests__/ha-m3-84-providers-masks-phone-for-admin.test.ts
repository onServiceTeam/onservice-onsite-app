// HA-M3-84 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// D25; review finding on the M3-API build): the provider responsiveness table
// (GET /admin/marketplace-health/providers) masks each provider's phone for an
// admin ("+63 9XX XXX 4567", contactMasked true) and shows it raw only to a
// super_admin, the same rule as Booking 360 "Who was notified" (HA-M3-39).
// Calling a provider goes through the audit-logged reveal-contact route. No
// email is returned. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, providerPhoneA, superAdminUser, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-84: the providers table masks provider phones for admin and shows them raw to super_admin', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '40 minutes' });
    await insertInvite(database, { bookingId, providerId: providerA, sentAgo: '40 minutes' });
    const contact = async (userId: string, role: string) => {
      const response = await marketplaceAdminHttp(userId, role).get('/providers');
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain('email');
      return response.body.data.map((row: Record<string, unknown>) => [row.providerId, row.phone, row.contactMasked]);
    };

    expect(await contact(adminUser, 'admin')).toEqual([[providerA, '+63 9XX XXX 4567', true]]);
    expect(await contact(superAdminUser, 'super_admin')).toEqual([[providerA, providerPhoneA, false]]);
  });
}, 90000);
