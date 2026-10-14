// HA-M3-28 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 90): requests that never got a quote are counted in
// noResponse and left out of p50 and p90, so the percentiles describe how
// fast providers answer when they do. Four requests from the last hour: first
// quotes after 10 and 30 minutes, and two with none, give p50 20 and p90 28,
// with 2 responded and 2 without a response, overall and for the category
// (within30Pct 50: both answered requests came within 30 minutes, out of 4).
// Real HTTP on the guarded PostgreSQL fixture (default range: the last 30
// Manila days).
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function answeredAfter(database: Pool, minutes: number): Promise<void> {
  const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '1 hour' });
  const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
  await database.query(`UPDATE booking_quotes q SET created_at = b.created_at + make_interval(mins => $2::int)
    FROM bookings b WHERE q.id = $1 AND b.id = q.booking_id`, [quoteId, minutes]);
}

it('HA-M3-28: requests with no response are counted in noResponse and left out of p50/p90', async () => {
  await withMarketplaceDatabase(async database => {
    await answeredAfter(database, 10);
    await answeredAfter(database, 30);
    await insertQuoteRequest(database, { createdAgo: '1 hour' });
    await insertQuoteRequest(database, { createdAgo: '50 minutes' });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/response-times?groupBy=category');

    expect(response.status).toBe(200);
    const expected = { requests: 4, responded: 2, noResponse: 2, p50Minutes: 20, p90Minutes: 28, within30Pct: 50 };
    expect(response.body.meta.overall).toEqual(expected);
    expect(response.body.data).toEqual([{ categoryName: 'Aircon Services', ...expected }]);
  });
}, 90000);
