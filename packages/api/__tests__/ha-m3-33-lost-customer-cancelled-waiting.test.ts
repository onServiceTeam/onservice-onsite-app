// HA-M3-33 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 95): a request the customer cancelled while waiting,
// without declining any quote, is lost as customer_cancelled_waiting, and
// only that, even though provider A had opened it without quoting (the
// viewed_none_responded rule would also match). Real HTTP on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, closeByCustomer, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-33: a customer who gave up waiting is lost as customer_cancelled_waiting only', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '3 hours', roundOpenedAgo: '3 hours' });
    await insertInvite(database, { bookingId, providerId: providerA, status: 'viewed', sentAgo: '3 hours', viewedAfterMinutes: 3 });
    await closeByCustomer(database, bookingId);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({
      bookingId, reason: 'customer_cancelled_waiting', closedBy: 'customer', invited: 1, viewed: 1, quotes: 0,
    })]);
    expect(response.body.meta.summary.byReason).toEqual({
      no_eligible_provider: 0, notified_none_viewed: 0, viewed_none_responded: 0,
      customer_declined_all_rounds: 0, customer_cancelled_waiting: 1, expired_no_response: 0,
    });
  });
}, 90000);
