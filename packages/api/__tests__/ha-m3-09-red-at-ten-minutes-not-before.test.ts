// HA-M3-09 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md tests 75-76): the sweep raises a red alert for a quote
// request with no live quote 10 minutes (ops_request_alert_red_minutes) after
// its round opened, and not before: a request at 9 minutes 50 seconds is
// amber only. A request first seen at 10 minutes gets red alone, without an
// amber it never needed. The real sweep runs on the guarded PostgreSQL
// fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-09: red is raised at 10 minutes without a quote, and not at 9 minutes 50 seconds', async () => {
  await withMarketplaceDatabase(async database => {
    const atTen = await insertQuoteRequest(database, { roundOpenedAgo: '10 minutes' });
    const almostTen = await insertQuoteRequest(database, { roundOpenedAgo: '9 minutes 50 seconds' });

    await sweepMarketplaceAlerts();

    expect((await alertsOf(database, atTen)).map(alert => [alert.kind, alert.threshold_minutes, alert.open]))
      .toEqual([['request_waiting_red', 10, true]]);
    expect((await alertsOf(database, almostTen)).map(alert => [alert.kind, alert.threshold_minutes, alert.open]))
      .toEqual([['request_waiting_amber', 5, true]]);
  });
}, 90000);
