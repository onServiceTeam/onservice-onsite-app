// HA-M3-05 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 73): GET /admin/marketplace-health/open-requests lists
// the requests still waiting on providers first, longest wait first, measuring
// each wait from COALESCE(request_round_opened_at, created_at): a request the
// customer reopened 7 minutes ago (posted 2 hours ago) waits 7 minutes, and a
// request from before the engine (no round clock) waits since it was posted.
// A request whose live quote waits for the customer comes after them; closed
// requests and fixed-price bookings are not listed. Real HTTP on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-05: open requests are sorted by longest wait, waiting-on-providers before waiting-on-customer', async () => {
  await withMarketplaceDatabase(async database => {
    const fresh = await insertQuoteRequest(database, { roundOpenedAgo: '3 minutes' });
    const legacy = await insertQuoteRequest(database, { createdAgo: '20 minutes' });
    const reopened = await insertQuoteRequest(database, { createdAgo: '2 hours', roundOpenedAgo: '7 minutes', round: 2 });
    const quoted = await insertQuoteRequest(database, { status: 'quoted', roundOpenedAgo: '30 minutes' });
    await insertQuote(database, { bookingId: quoted, providerId: providerA });
    await insertQuoteRequest(database, { status: 'cancelled_by_customer', roundOpenedAgo: '40 minutes' });
    await insertQuoteRequest(database, { bookingType: 'fixed_price', createdAgo: '50 minutes' });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/open-requests');

    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { bookingId: string; waitingOn: string; waitMinutes: number }) =>
      [row.bookingId, row.waitingOn, row.waitMinutes])).toEqual([
      [legacy, 'providers', 20],
      [reopened, 'providers', 7],
      [fresh, 'providers', 3],
      [quoted, 'customer', 30],
    ]);
    expect(response.body.meta).toMatchObject({ amberMinutes: 5, redMinutes: 10, maxRounds: 3 });
  });
}, 90000);
