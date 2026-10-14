// HA-M3-85 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): request_unfilled covers only requests
// that closed in the last 24 hours, so the first sweep after a deploy does not
// raise an alert (and a Slack message) for every quote request that ever
// closed without a quote. Two requests closed by the 72-hour expiry with no
// quote: the one that closed 23 hours ago is alerted, the one that closed 25
// hours ago is not. Real SQL on the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuoteRequest } from './helpers/request-flow-postgres';
import { alertsOf, closeAsExpired, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function expiredHoursAgo(database: Pool, hours: number): Promise<string> {
  const bookingId = await insertQuoteRequest(database, { createdAgo: '4 days', roundOpenedAgo: '4 days' });
  await closeAsExpired(database, bookingId);
  await database.query(`UPDATE bookings SET cancelled_at = NOW() - make_interval(hours => $2::int),
      updated_at = NOW() - make_interval(hours => $2::int) WHERE id = $1`, [bookingId, hours]);
  return bookingId;
}

it('HA-M3-85: request_unfilled is raised for a request closed 23 hours ago and not for one closed 25 hours ago', async () => {
  await withMarketplaceDatabase(async database => {
    const recent = await expiredHoursAgo(database, 23);
    const old = await expiredHoursAgo(database, 25);

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect((await alertsOf(database, recent)).map(alert => alert.kind)).toEqual(['request_unfilled']);
    expect(await alertsOf(database, old)).toEqual([]);
  });
}, 90000);
