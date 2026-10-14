// HA-M3-97 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md section 4.1 getResponseTimes, flagged as missing by the
// review of the M3-API build): each response-time group, and the overall row,
// carries within30Pct, the percentage of the group's requests whose first
// quote came within 30 minutes. A request with no quote counts as not
// answered within 30 minutes, so the share is over every request, not only
// the answered ones. Four requests from the last 2 hours: first quotes after
// 10, exactly 30 and 45 minutes, and one with none, give 2 of 4 = 50 percent.
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
  const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '2 hours' });
  const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
  await database.query(`UPDATE booking_quotes q SET created_at = b.created_at + make_interval(mins => $2::int)
    FROM bookings b WHERE q.id = $1 AND b.id = q.booking_id`, [quoteId, minutes]);
}

it('HA-M3-97: within30Pct is the share of all requests whose first quote came within 30 minutes', async () => {
  await withMarketplaceDatabase(async database => {
    await answeredAfter(database, 10);
    await answeredAfter(database, 30);
    await answeredAfter(database, 45);
    await insertQuoteRequest(database, { createdAgo: '2 hours' });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/response-times?groupBy=category');

    expect(response.status).toBe(200);
    expect(response.body.meta.overall).toMatchObject({ requests: 4, responded: 3, noResponse: 1, within30Pct: 50 });
    expect(response.body.data).toEqual([
      expect.objectContaining({ categoryName: 'Aircon Services', requests: 4, within30Pct: 50 }),
    ]);
  });
}, 90000);
