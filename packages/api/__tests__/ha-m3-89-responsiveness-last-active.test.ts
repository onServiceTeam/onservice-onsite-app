// HA-M3-89 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md 4.1; review finding on the M3-API build): a provider's
// lastActiveAt is the latest of their last login, the last time they opened
// a request and the last quote they sent. Each of three providers is latest
// on a different one:
//   - A logged in 3 days ago, opened a request 89 minutes ago and sent its
//     quote 30 minutes ago: the quote time;
//   - B logged in 5 days ago and opened a request 20 minutes ago, no quote:
//     the view time;
//   - C logged in 5 minutes ago and never opened the request: the login.
// Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  addProvider, insertQuote, insertQuoteRequest, providerA, providerB, providerC, providerUserA, providerUserB,
  providerUserC,
} from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-89: lastActiveAt is the latest of the last login, the last view and the last quote', async () => {
  await withMarketplaceDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database, { status: 'quoted', createdAgo: '2 hours' });
    const quoteId = await insertQuote(database, { bookingId, providerId: providerA });
    await database.query("UPDATE booking_quotes SET created_at = NOW() - INTERVAL '30 minutes' WHERE id = $1", [quoteId]);
    await insertInvite(database, {
      bookingId, providerId: providerA, status: 'quoted', sentAgo: '90 minutes', viewedAfterMinutes: 1,
      respondedAfterMinutes: 60, quoteId,
    });
    await insertInvite(database, { bookingId, providerId: providerB, status: 'viewed', sentAgo: '40 minutes', viewedAfterMinutes: 20 });
    await insertInvite(database, { bookingId, providerId: providerC, sentAgo: '60 minutes' });
    await database.query(`UPDATE users SET last_login_at = NOW() - CASE id WHEN $1::uuid THEN INTERVAL '3 days'
        WHEN $2::uuid THEN INTERVAL '5 days' ELSE INTERVAL '5 minutes' END
      WHERE id IN ($1, $2, $3)`, [providerUserA, providerUserB, providerUserC]);
    const iso = async (sql: string, params: unknown[]) =>
      ((await database.query<{ at: Date }>(sql, params)).rows[0]!.at).toISOString();
    const expected = {
      [providerA]: await iso('SELECT created_at AS at FROM booking_quotes WHERE id = $1', [quoteId]),
      [providerB]: await iso('SELECT viewed_at AS at FROM job_request_invites WHERE booking_id = $1 AND provider_id = $2',
        [bookingId, providerB]),
      [providerC]: await iso('SELECT last_login_at AS at FROM users WHERE id = $1', [providerUserC]),
    };

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/providers');

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.body.data.map((row: { providerId: string; lastActiveAt: string | null }) =>
      [row.providerId, row.lastActiveAt]))).toEqual(expected);
  });
}, 90000);
