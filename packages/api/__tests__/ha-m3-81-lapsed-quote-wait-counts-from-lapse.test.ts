// HA-M3-81 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): when a request's only quote lapses,
// the wait for a new quote starts at the lapse, not when the round opened.
// The engine reopens a lapsed request on its 5-minute job (expireStaleQuotes,
// then reconcileRequestAfterQuoteLapse), so for up to 5 minutes the request
// sits in 'quoted' with no live quote in the same round. Both requests below
// opened 47 hours ago and provider A quoted within 3 minutes:
//   - "recent": the quote expired 1 minute ago. The sweep raises nothing and
//     the queue and the summary show a 1-minute wait with no severity, not a
//     47-hour red wait (the false alert and Slack page the review found);
//   - "stuck": the quote expired 11 minutes ago and the engine never reopened
//     the request. That is a real 11-minute wait with no live quote, so it is
//     still raised as red, measured from the lapse.
// Real HTTP and real SQL on the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, alertsOf, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';
import { sweepMarketplaceAlerts } from '../src/services/marketplace-alert.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function requestWhoseQuoteLapsed(database: Pool, lapsedMinutesAgo: number): Promise<string> {
  const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '47 hours', roundOpenedAgo: '47 hours' });
  const quoteId = await insertQuote(database, {
    bookingId, providerId: providerA, expiresAtSql: `NOW() - INTERVAL '${lapsedMinutesAgo} minutes'`,
  });
  await database.query(`UPDATE booking_quotes q SET created_at = b.request_round_opened_at + INTERVAL '3 minutes'
    FROM bookings b WHERE q.id = $1 AND b.id = q.booking_id`, [quoteId]);
  return bookingId;
}

it('HA-M3-81: after a quote lapses the wait counts from the lapse, not from the round opening', async () => {
  await withMarketplaceDatabase(async database => {
    const recent = await requestWhoseQuoteLapsed(database, 1);
    const stuck = await requestWhoseQuoteLapsed(database, 11);

    expect(await sweepMarketplaceAlerts()).toEqual({ raised: 1, resolved: 0 });

    expect(await alertsOf(database, recent)).toEqual([]);
    expect((await alertsOf(database, stuck)).map(alert => [alert.kind, alert.request_round, alert.open]))
      .toEqual([['request_waiting_red', 1, true]]);
    expect((await database.query('SELECT details FROM marketplace_alerts WHERE booking_id = $1', [stuck])).rows[0].details)
      .toMatchObject({ waitMinutes: 11 });

    const http = marketplaceAdminHttp(adminUser, 'admin');
    const queue = await http.get('/open-requests');
    expect(queue.status).toBe(200);
    expect(queue.body.data.map((row: Record<string, unknown>) => [row.bookingId, row.waitingOn, row.waitMinutes, row.severity]))
      .toEqual([
        [stuck, 'providers', 11, 'red'],
        [recent, 'providers', 1, 'none'],
      ]);
    const summary = await http.get('/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ waitingCount: 2, waitingOverAmber: 1, waitingOverRed: 1 });
  });
}, 90000);
