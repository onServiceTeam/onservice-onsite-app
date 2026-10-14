// HA-M3-87 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// review finding on the M3-API build): time to first response uses the
// request's first quote, not its last. One request from the last 2 hours got
// a quote from provider A after 20 minutes and a second from provider B after
// 90 minutes: p50 and p90 are both 20 minutes, and it counts as answered
// within 30 minutes. Real HTTP on the guarded PostgreSQL fixture (default
// range: the last 30 Manila days).
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA, providerB } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function quoteAfter(database: Pool, bookingId: string, providerId: string, minutes: number): Promise<void> {
  const quoteId = await insertQuote(database, { bookingId, providerId });
  await database.query(`UPDATE booking_quotes q SET created_at = b.created_at + make_interval(mins => $2::int)
    FROM bookings b WHERE q.id = $1 AND b.id = q.booking_id`, [quoteId, minutes]);
}

it('HA-M3-87: time to first response counts the first of two quotes', async () => {
  await withMarketplaceDatabase(async database => {
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '2 hours' });
    await quoteAfter(database, bookingId, providerB, 90);
    await quoteAfter(database, bookingId, providerA, 20);

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/response-times');

    expect(response.status).toBe(200);
    expect(response.body.meta.overall).toEqual({
      requests: 1, responded: 1, noResponse: 0, p50Minutes: 20, p90Minutes: 20, within30Pct: 100,
    });
  });
}, 90000);
