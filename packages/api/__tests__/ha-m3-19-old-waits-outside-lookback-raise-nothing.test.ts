// HA-M3-19 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 84): waits that began longer ago than the
// unmatched-request expiry window (72 hours) raise no waiting alert, so the
// first sweep after a deploy does not flood the back office with old open
// requests. A request posted 73 hours ago and still open (from before the
// engine, no round clock) raises nothing; one posted 71 hours ago raises red.
// The real sweep runs on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-19: a wait older than the 72-hour lookback raises no alert', async () => {
  await withMarketplaceDatabase(async database => {
    const tooOld = await insertQuoteRequest(database, { createdAgo: '73 hours' });
    const inside = await insertQuoteRequest(database, { createdAgo: '71 hours' });

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect(await alertsOf(database, tooOld)).toEqual([]);
    expect((await alertsOf(database, inside)).map(alert => alert.kind)).toEqual(['request_waiting_red']);
  });
}, 90000);
