// HA-M3-32 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 94): a closed request whose customer declined the
// quotes they got is lost as customer_declined_all_rounds, and only that,
// even though the customer then cancelled it (the customer_cancelled_waiting
// rule would also match). Provider A quoted, the customer declined with a
// reason (declined_at set), and the customer cancelled. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, closeByCustomer, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-32: a customer who declined the quotes is lost as customer_declined_all_rounds only', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { createdAgo: '3 hours', roundOpenedAgo: '2 hours', round: 2 });
    const quoteId = await insertQuote(database, {
      bookingId, providerId: providerA, status: 'declined', declineReason: 'too_expensive', round: 1,
    });
    await insertInvite(database, {
      bookingId, providerId: providerA, status: 'declined', sentAgo: '3 hours', viewedAfterMinutes: 2,
      respondedAfterMinutes: 8, quoteId,
    });
    await closeByCustomer(database, bookingId);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({
      bookingId, reason: 'customer_declined_all_rounds', closedBy: 'customer', quotes: 1, declinedQuotes: 1, rounds: 2,
    })]);
    expect(response.body.meta.summary.byReason).toEqual({
      no_eligible_provider: 0, notified_none_viewed: 0, viewed_none_responded: 0,
      customer_declined_all_rounds: 1, customer_cancelled_waiting: 0, expired_no_response: 0,
    });
  });
}, 90000);
