// HA-M3-14 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 79): an open waiting alert resolves itself as
// 'quote_received' on the next sweep once a provider's quote is live. Provider
// A sends a real quote through the real quote route (real admission, real
// invite link) and the sweep raises nothing new. Real HTTP and real SQL on
// the guarded PostgreSQL fixture with the real migrations 183-186.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { flowHttp, insertQuoteRequest, providerUserA } from './helpers/request-flow-postgres';
import { alertsOf, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-14: a live quote auto-resolves the open waiting alert as quote_received', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { roundOpenedAgo: '7 minutes' });
    await sweepMarketplaceAlerts();
    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.open]))
      .toEqual([['request_waiting_amber', true]]);

    const quote = await flowHttp(providerUserA, 'provider').quote(bookingId);
    expect(quote.status).toBe(201);

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 0, resolved: 1 });
    expect((await alertsOf(database, bookingId)).map(alert => [alert.kind, alert.open, alert.resolution]))
      .toEqual([['request_waiting_amber', false, 'quote_received']]);
  });
}, 90000);
