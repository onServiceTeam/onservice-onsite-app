// HA-M3-39 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 101; D25): Booking 360 "Who was notified" (GET
// /admin/marketplace-health/bookings/:id/invites) lists each provider told
// about the request with their round, status and sent / viewed / responded
// times, and masks the provider's phone for an admin ("+63 9XX XXX 4567")
// while a super_admin sees it raw. No email is returned. Calling a provider
// goes through the existing audit-logged reveal-contact route. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA, providerB } from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, providerPhoneA, providerPhoneB, superAdminUser, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-39: who-was-notified masks provider phones for admin and shows them raw to super_admin', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', roundOpenedAgo: '20 minutes' });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
    await insertInvite(database, {
      bookingId, providerId: providerA, status: 'quoted', sentAgo: '20 minutes', viewedAfterMinutes: 3,
      respondedAfterMinutes: 12, quoteId,
    });
    await insertInvite(database, { bookingId, providerId: providerB, status: 'sent', sentAgo: '20 minutes' });
    const rows = async (userId: string, role: string) => {
      const response = await marketplaceAdminHttp(userId, role).get(`/bookings/${bookingId}/invites`);
      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ applicable: true, currentRound: 1 });
      expect(JSON.stringify(response.body)).not.toContain('email');
      return response.body.data.map((row: Record<string, unknown>) => ({
        providerId: row.providerId, providerName: row.providerName, phone: row.phone, contactMasked: row.contactMasked,
        round: row.round, status: row.status, viewed: row.viewedAt !== null, responded: row.respondedAt !== null,
        responseMinutes: row.responseMinutes,
      })).sort((a: { providerName: string }, b: { providerName: string }) => a.providerName.localeCompare(b.providerName));
    };

    expect(await rows(adminUser, 'admin')).toEqual([
      {
        providerId: providerA, providerName: 'Synthetic Aircon Team A', phone: '+63 9XX XXX 4567', contactMasked: true,
        round: 1, status: 'quoted', viewed: true, responded: true, responseMinutes: 12,
      },
      {
        providerId: providerB, providerName: 'Synthetic Aircon Team B', phone: '+63 9XX XXX 2222', contactMasked: true,
        round: 1, status: 'sent', viewed: false, responded: false, responseMinutes: null,
      },
    ]);
    expect((await rows(superAdminUser, 'super_admin')).map((row: { phone: string; contactMasked: boolean }) =>
      [row.phone, row.contactMasked])).toEqual([[providerPhoneA, false], [providerPhoneB, false]]);
  });
}, 90000);
