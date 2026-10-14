// HA-M3-95 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): a request flagged for back-office
// review carries one open request_needs_ops alert at a time. The flag stays
// set if the request later moves to another round (a provider quotes from
// their list and the customer declines again), and the open alert from the
// earlier round already covers it, so no second needs_ops alert is raised
// for the new round. Real SQL on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-95: no second needs_ops alert is raised while one is still open', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { round: 3, createdAgo: '2 hours', roundOpenedAgo: '1 minute' });
    await database.query(`UPDATE bookings SET request_declined_rounds = 3, request_ops_review_at = NOW(),
        request_ops_review_reason = 'max_rounds' WHERE id = $1`, [bookingId]);
    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    await database.query(`UPDATE bookings SET request_round = 4, request_declined_rounds = 4,
        request_round_opened_at = NOW() WHERE id = $1`, [bookingId]);
    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 0, resolved: 0 });

    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.request_round, alert.open]))
      .toEqual([['request_needs_ops', 3, true]]);
  });
}, 90000);
