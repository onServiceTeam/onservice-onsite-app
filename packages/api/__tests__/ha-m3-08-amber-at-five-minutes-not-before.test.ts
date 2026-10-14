// HA-M3-08 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 75): the back-office sweep raises an amber alert for a
// quote request with no live quote 5 minutes (ops_request_alert_amber_minutes)
// after its round opened, and nothing for a request that has waited 4
// minutes. The real sweep runs on the guarded PostgreSQL fixture with the
// real migrations 183-186.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-08: amber is raised at 5 minutes without a quote, and not at 4 minutes', async () => {
  await withMarketplaceDatabase(async database => {
    const atFive = await insertQuoteRequest(database, { roundOpenedAgo: '5 minutes' });
    const atFour = await insertQuoteRequest(database, { roundOpenedAgo: '4 minutes' });

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect(await alertsOf(database, atFive)).toEqual([{
      booking_id: atFive, kind: 'request_waiting_amber', request_round: 1, threshold_minutes: 5,
      resolution: null, open: true, acknowledged: false,
    }]);
    expect(await alertsOf(database, atFour)).toEqual([]);
  });
}, 90000);
