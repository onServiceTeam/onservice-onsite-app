// HA-M3-86 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): request_unfilled means "closed with no
// quote at all". Two requests closed by the 72-hour expiry: the one that
// never got a quote is alerted; the one where provider A did quote (the quote
// lapsed unanswered) is not, because a provider did respond. Its loss still
// shows on the lost-opportunities tab (HA-M3-34). Real SQL on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import { alertsOf, closeAsExpired, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-86: an expired request that had a quote raises no request_unfilled', async () => {
  await withMarketplaceDatabase(async database => {
    const quoted = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    await insertQuote(database, {
      bookingId: quoted, providerId: providerA, status: 'expired', expiresAtSql: "NOW() - INTERVAL '30 hours'",
    });
    await closeAsExpired(database, quoted);
    const neverQuoted = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    await closeAsExpired(database, neverQuoted);

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect(await alertsOf(database, quoted)).toEqual([]);
    expect((await alertsOf(database, neverQuoted)).map(alert => alert.kind)).toEqual(['request_unfilled']);
  });
}, 90000);
