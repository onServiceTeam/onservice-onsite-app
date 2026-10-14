// HA-M3-22 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 86; E33, E47): the alert sweep is read-only towards
// the marketplace. Over requests that raise every kind of alert (amber, red,
// needs ops, unfilled) and a request with a live quote, the sweep writes
// marketplace_alerts rows and nothing else: every booking, quote, invite,
// provider (including rating and job counts), notification and admin action
// row is unchanged, and no notification is created for anyone. Real SQL on
// the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA, providerB } from './helpers/request-flow-postgres';
import { closeAsExpired, insertInvite, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function marketplaceState(database: Pool): Promise<unknown> {
  const table = async (name: string) => (await database.query(`SELECT * FROM ${name} ORDER BY id`)).rows;
  return {
    bookings: await table('bookings'),
    quotes: await table('booking_quotes'),
    invites: await table('job_request_invites'),
    providers: await table('providers'),
    notifications: await table('notifications'),
    adminActions: await table('admin_actions'),
    offers: await table('booking_offers'),
  };
}

it('HA-M3-22: the sweep writes only marketplace_alerts', async () => {
  await withMarketplaceDatabase(async database => {
    const amber = await insertQuoteRequest(database, { roundOpenedAgo: '6 minutes' });
    await insertInvite(database, { bookingId: amber, providerId: providerA, sentAgo: '6 minutes', viewedAfterMinutes: 1, status: 'viewed' });
    await insertQuoteRequest(database, { roundOpenedAgo: '15 minutes' });
    const flagged = await insertQuoteRequest(database, { roundOpenedAgo: '1 minute' });
    await database.query(`UPDATE bookings SET request_ops_review_at = NOW(), request_ops_review_reason = 'no_eligible_providers'
      WHERE id = $1`, [flagged]);
    const expired = await insertQuoteRequest(database, { createdAgo: '73 hours', roundOpenedAgo: '73 hours' });
    await closeAsExpired(database, expired);
    const quoted = await insertQuoteRequest(database, { status: 'quoted', roundOpenedAgo: '20 minutes' });
    await insertQuote(database, { bookingId: quoted, providerId: providerB });
    const before = await marketplaceState(database);

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 4, resolved: 0 });

    expect(await marketplaceState(database)).toEqual(before);
    expect((await database.query('SELECT kind FROM marketplace_alerts ORDER BY kind')).rows.map(row => row.kind)).toEqual([
      'request_needs_ops', 'request_unfilled', 'request_waiting_amber', 'request_waiting_red',
    ]);
  });
}, 90000);
