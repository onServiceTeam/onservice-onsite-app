// HA-M3-13 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 78): when a request that already has an open amber
// alert passes the red threshold, the sweep raises red for the same round and
// resolves the amber as 'escalated', so the back office sees one live alert
// per request. The database clock cannot be moved, so the request's round
// clock is moved back 5 minutes between the two sweeps (the same state the
// table holds 5 minutes later). The real sweep runs on the guarded PostgreSQL
// fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-13: amber is resolved as escalated when the same round turns red', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await sweepMarketplaceAlerts();
    await database.query(`UPDATE bookings SET request_round_opened_at = request_round_opened_at - INTERVAL '5 minutes'
      WHERE id = $1`, [bookingId]);

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 1 });

    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.request_round, alert.open, alert.resolution]))
      .toEqual([
        ['request_waiting_amber', 1, false, 'escalated'],
        ['request_waiting_red', 1, true, null],
      ]);
  });
}, 90000);
