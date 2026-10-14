// HA-M3-29 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 91 with the merged.md rename): a closed request nobody
// could be told about is lost as no_eligible_provider, and only that. One
// request was flagged by round 1 (request_ops_review_reason
// 'no_eligible_providers') even though a provider later opened it from their
// list; the other has no invite and no older new_job_request notice at all.
// Both expired. GET /admin/marketplace-health/lost-opportunities lists each
// once with that reason, closed by the system, and the reason summary counts
// 2 there and 0 everywhere else. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, closeAsExpired, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-29: a request nobody could be told about is lost as no_eligible_provider only', async () => {
  await withMarketplaceDatabase(async database => {
    const flagged = await insertQuoteRequest(database, { createdAgo: '3 hours', roundOpenedAgo: '3 hours' });
    await database.query(`UPDATE bookings SET request_ops_review_at = NOW() - INTERVAL '3 hours',
        request_ops_review_reason = 'no_eligible_providers' WHERE id = $1`, [flagged]);
    await insertInvite(database, {
      bookingId: flagged, providerId: providerA, source: 'inbox', status: 'viewed', sentAgo: '2 hours', viewedAfterMinutes: 0,
    });
    await closeAsExpired(database, flagged);
    const untold = await insertQuoteRequest(database, { createdAgo: '2 hours' });
    await closeAsExpired(database, untold);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/lost-opportunities');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: Record<string, unknown>) => [row.bookingId, row.reason, row.closedBy]).sort())
      .toEqual([[flagged, 'no_eligible_provider', 'system'], [untold, 'no_eligible_provider', 'system']].sort());
    expect(response.body.meta.total).toBe(2);
    expect(response.body.meta.summary.byReason).toEqual({
      no_eligible_provider: 2, notified_none_viewed: 0, viewed_none_responded: 0,
      customer_declined_all_rounds: 0, customer_cancelled_waiting: 0, expired_no_response: 0,
    });
  });
}, 90000);
