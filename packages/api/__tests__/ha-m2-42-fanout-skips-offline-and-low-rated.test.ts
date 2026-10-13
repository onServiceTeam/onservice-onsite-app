// HA-M2-42 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// the fan-out notifies only providers who are switched online and not below
// the matcher's rating floor (a proven-low average: under
// matching_min_rating 2.5 with at least 5 reviews). Provider B is offline and
// provider C averages 1.5 stars over 10 reviews; only provider A is invited.
// Real fan-out over real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, addProvider, invitesOf, notificationsOf,
  providerA, providerB, providerC, providerUserB, providerUserC,
} from './helpers/request-flow-postgres';
import { notifyProvidersOfJobRequest } from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-42: offline and rating-floor providers are skipped by the fan-out', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query('UPDATE providers SET is_available = FALSE WHERE id = $1', [providerB]);
    await addProvider(database, { providerId: providerC, userId: providerUserC, rating: 1.5, totalReviews: 10 });
    const bookingId = await insertQuoteRequest(database);

    await notifyProvidersOfJobRequest({ id: bookingId });

    expect((await invitesOf(database, bookingId)).map(i => i.provider_id)).toEqual([providerA]);
    expect(await notificationsOf(database, providerUserB)).toEqual([]);
    expect(await notificationsOf(database, providerUserC)).toEqual([]);
    expect((await invitesOf(database, bookingId)).some(i => i.provider_id === providerC || i.provider_id === providerB)).toBe(false);
  });
}, 90000);
