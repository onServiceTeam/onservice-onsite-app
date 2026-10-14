// HA-M3-27 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 89): GET /admin/marketplace-health/response-times
// counts the quote requests created on the range's Manila calendar days and
// reports p50 and p90 time to first response over them. For 1-30 September
// 2026, a request at 00:00 on 1 September and one at 23:30 on 30 September
// (Manila) are in; one at 00:30 on 1 October and one at 23:59 on 31 August
// are out, although in UTC the 1 September request falls on 31 August and the
// 1 October request on 30 September. The 23:30 request's first quote came at
// 00:10 the next day, 40 minutes later. Included first responses: 20, 40 and
// 60 minutes, so p50 is 40 and p90 is 56 (percentile_cont). Counted by UTC
// days the set would be 40, 60 and 100 minutes (p50 60, p90 92). One of the
// three included requests was answered within 30 minutes (within30Pct 33.3).
// Real HTTP on the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function requestAnsweredAfter(database: Pool, createdAt: string, minutes: number): Promise<string> {
  const bookingId = await insertQuoteRequest(database, { status: 'quoted' });
  await database.query('UPDATE bookings SET created_at = $2::timestamptz WHERE id = $1', [bookingId, createdAt]);
  const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
  await database.query(`UPDATE booking_quotes SET created_at = $2::timestamptz + make_interval(mins => $3::int)
    WHERE id = $1`, [quoteId, createdAt, minutes]);
  return bookingId;
}

it('HA-M3-27: response-time ranges are Manila calendar days and p50/p90 use only requests inside them', async () => {
  await withMarketplaceDatabase(async database => {
    await requestAnsweredAfter(database, '2026-09-01T00:00:00+08:00', 20);
    await requestAnsweredAfter(database, '2026-09-30T23:30:00+08:00', 40);
    await requestAnsweredAfter(database, '2026-09-15T12:00:00+08:00', 60);
    await requestAnsweredAfter(database, '2026-10-01T00:30:00+08:00', 100);
    await requestAnsweredAfter(database, '2026-08-31T23:59:00+08:00', 5);

    const response = await marketplaceAdminHttp(adminUser, 'admin')
      .get('/response-times?from=2026-09-01&to=2026-09-30&groupBy=city');

    expect(response.status).toBe(200);
    expect(response.body.meta.overall).toEqual({
      requests: 3, responded: 3, noResponse: 0, p50Minutes: 40, p90Minutes: 56, within30Pct: 33.3,
    });
    expect(response.body.data).toEqual([
      { city: 'Cebu City', requests: 3, responded: 3, noResponse: 0, p50Minutes: 40, p90Minutes: 56, within30Pct: 33.3 },
    ]);
    expect(response.body.meta).toMatchObject({ from: '2026-09-01', to: '2026-09-30', groupBy: 'city' });
  });
}, 90000);
