// HA-M3-40 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 102): the dashboard figure GET
// /admin/marketplace-health/summary counts the open requests still waiting on
// providers, how many have waited at least the amber and the red threshold,
// the requests whose live quote waits for the customer, and the open and
// unacknowledged alerts, with the thresholds it used. Requests waiting 3, 6
// and 12 minutes and one with a live quote, after one sweep: 3 waiting, 2
// over amber, 1 over red, 1 awaiting the customer, 2 open alerts. Real HTTP
// on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-40: the summary counts requests waiting over amber and over red', async () => {
  await withMarketplaceDatabase(async database => {
    await insertQuoteRequest(database, { roundOpenedAgo: '3 minutes' });
    await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await insertQuoteRequest(database, { roundOpenedAgo: '12 minutes' });
    const quoted = await insertQuoteRequest(database, { status: 'quoted', roundOpenedAgo: '30 minutes' });
    await insertQuote(database, { bookingId: quoted, providerId: providerA });
    await sweepMarketplaceAlerts();

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/summary');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      waitingCount: 3,
      waitingOverAmber: 2,
      waitingOverRed: 1,
      awaitingCustomer: 1,
      openAlerts: 2,
      unacknowledgedAlerts: 2,
      amberMinutes: 5,
      redMinutes: 10,
    });
  });
}, 90000);
