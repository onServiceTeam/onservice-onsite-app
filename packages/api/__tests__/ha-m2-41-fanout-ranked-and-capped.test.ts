// HA-M2-41 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// the fan-out ranks eligible providers with the fixed-price matcher's own
// score (rating, distance, reliability, tier) and invites only the best
// request_max_invites (set to 2 here), recording each invite's rank and score.
// Three eligible providers: C (5.0 stars, 0.7 km), B (4.0 stars, 3.2 km) and
// A (no reviews, 2.3 km). Real fan-out over real rows on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, addProvider, invitesOf, notificationsOf, upsertPlatformSetting,
  providerB, providerC, providerUserA, providerUserB, providerUserC,
} from './helpers/request-flow-postgres';
import { notifyProvidersOfJobRequest } from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-41: invites are ordered by score and capped at request_max_invites', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_invites', '2');
    await database.query('UPDATE providers SET rating = 4.0, total_reviews = 10 WHERE id = $1', [providerB]);
    await addProvider(database, { providerId: providerC, userId: providerUserC, rating: 5.0, totalReviews: 20 });
    const bookingId = await insertQuoteRequest(database);

    const result = await notifyProvidersOfJobRequest({ id: bookingId });

    expect(result).toMatchObject({ round: 1, candidates: 2, invited: 2, notified: 2 });
    const invites = (await database.query(`SELECT provider_id, rank, score::float8 AS score, source, status
      FROM job_request_invites WHERE booking_id = $1 ORDER BY rank`, [bookingId])).rows;
    expect(invites.map(i => [i.provider_id, i.rank, i.source, i.status])).toEqual([
      [providerC, 1, 'push', 'sent'], [providerB, 2, 'push', 'sent'],
    ]);
    expect(invites[0].score).toBeGreaterThan(invites[1].score);
    expect((await invitesOf(database, bookingId)).length).toBe(2);
    expect(await notificationsOf(database, providerUserA)).toEqual([]);
    expect((await notificationsOf(database, providerUserC)).map(n => n.type)).toEqual(['new_job_request']);
    expect((await notificationsOf(database, providerUserB)).map(n => n.type)).toEqual(['new_job_request']);
  });
}, 90000);
