// HA-M3-07 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 74): a request holding a live quote is listed as
// waiting on the customer and gets no amber or red severity, however long
// ago its round opened, because a provider has already responded. Its wait
// is shown from the round opening (30 minutes), even though the customer
// declined a second quote in the same round a moment ago. A request
// whose only quote expired a minute ago is waiting on providers again, for 1
// minute (the wait restarts at the lapse, HA-M3-81), so it has no severity
// either although its round opened 25 minutes ago. Real HTTP on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA, providerB } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-07: a request with a live quote waits on the customer and has no severity', async () => {
  await withMarketplaceDatabase(async database => {
    const live = await insertQuoteRequest(database, { status: 'quoted', roundOpenedAgo: '30 minutes' });
    await insertQuote(database, { bookingId: live, providerId: providerA });
    await insertQuote(database, { bookingId: live, providerId: providerB, status: 'declined', declineReason: 'timing' });
    const lapsed = await insertQuoteRequest(database, { status: 'quoted', roundOpenedAgo: '25 minutes' });
    await insertQuote(database, { bookingId: lapsed, providerId: providerA, expiresAtSql: "NOW() - INTERVAL '1 minute'" });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/open-requests');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: Record<string, unknown>) => ({
      bookingId: row.bookingId, waitingOn: row.waitingOn, waitMinutes: row.waitMinutes, severity: row.severity,
      liveQuotes: row.liveQuotes,
    }))).toEqual([
      { bookingId: lapsed, waitingOn: 'providers', waitMinutes: 1, severity: 'none', liveQuotes: 0 },
      { bookingId: live, waitingOn: 'customer', waitMinutes: 30, severity: 'none', liveQuotes: 1 },
    ]);
  });
}, 90000);
