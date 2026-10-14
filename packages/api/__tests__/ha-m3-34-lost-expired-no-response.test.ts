// HA-M3-34 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 96): everything the other rules do not explain is
// lost as expired_no_response, and only that. One request got a quote from
// provider A that lapsed unanswered (quote 'expired', never declined); the
// other predates invite records: providers were told by the older stored
// new_job_request notice (no invite row, no recorded views). Both expired.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA, providerUserB } from './helpers/request-flow-postgres';
import {
  adminUser, closeAsExpired, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-34: lapsed quotes and older notified requests are lost as expired_no_response only', async () => {
  await withMarketplaceDatabase(async database => {
    const lapsed = await insertQuoteRequest(database, { createdAgo: '3 hours', roundOpenedAgo: '3 hours' });
    const quoteId = await insertQuote(database, {
      bookingId: lapsed, providerId: providerA, status: 'expired', expiresAtSql: "NOW() - INTERVAL '1 hour'",
    });
    await insertInvite(database, {
      bookingId: lapsed, providerId: providerA, status: 'quoted', sentAgo: '3 hours', viewedAfterMinutes: 1,
      respondedAfterMinutes: 5, quoteId,
    });
    await closeAsExpired(database, lapsed);
    const older = await insertQuoteRequest(database, { createdAgo: '2 hours' });
    await database.query(`INSERT INTO notifications (user_id, type, title, body, data)
      VALUES ($1, 'new_job_request', 'New quote request', 'A customer needs Aircon repair in Cebu City.',
              jsonb_build_object('bookingId', $2::text))`, [providerUserB, older]);
    await closeAsExpired(database, older);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: Record<string, unknown>) => [row.bookingId, row.reason]).sort())
      .toEqual([[lapsed, 'expired_no_response'], [older, 'expired_no_response']].sort());
    expect(response.body.meta.summary.byReason).toEqual({
      no_eligible_provider: 0, notified_none_viewed: 0, viewed_none_responded: 0,
      customer_declined_all_rounds: 0, customer_cancelled_waiting: 0, expired_no_response: 2,
    });
  });
}, 90000);
