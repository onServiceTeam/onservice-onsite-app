// HA-M3-31 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 93): a closed request that providers opened but nobody
// quoted is lost as viewed_none_responded, and only that. Provider A opened
// it, provider B never did, there was no quote, and it expired. Real HTTP on
// the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest, providerA, providerB } from './helpers/request-flow-postgres';
import {
  adminUser, closeAsExpired, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-31: providers opened it but nobody quoted is lost as viewed_none_responded only', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '3 hours', roundOpenedAgo: '3 hours' });
    await insertInvite(database, { bookingId, providerId: providerA, status: 'viewed', sentAgo: '3 hours', viewedAfterMinutes: 4 });
    await insertInvite(database, { bookingId, providerId: providerB, sentAgo: '3 hours' });
    await closeAsExpired(database, bookingId);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({
      bookingId, reason: 'viewed_none_responded', closedBy: 'system', invited: 2, viewed: 1, quotes: 0,
    })]);
    expect(response.body.meta.summary.byReason).toEqual({
      no_eligible_provider: 0, notified_none_viewed: 0, viewed_none_responded: 1,
      customer_declined_all_rounds: 0, customer_cancelled_waiting: 0, expired_no_response: 0,
    });
  });
}, 90000);
