// CR-401 (customer review 2026-10-17, slice P2, discovery-support-4, fix
// round): Service Provider profile privacy fix. The public catalog search
// (no sign-in needed) answers each Service Provider with the same kind of
// public fields as the profile: id, business name, tier, rating, number of
// reviews, city and photo, and nothing else. Real public catalog router and
// real SQL on the guarded PostgreSQL fixture.
import {
  approvedAvatarUrl, approvedProvider, approvedProviderUser, p2Http, p2It as it, withP2Database,
} from './helpers/p2-switches-postgres';
import catalogRouter from '../src/routes/catalog.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-401 — public search answers each Service Provider with public fields only', async () => {
  await withP2Database(async () => {
    const http = p2Http([['/api/v1/catalog', catalogRouter]]);

    const response = await http.get('/api/v1/catalog/search?q=Linis');

    expect(response.status).toBe(200);
    expect(response.body.data.providers).toEqual([{
      id: approvedProvider,
      businessName: 'Linis Pro Cleaning Services',
      tier: 'verified',
      averageRating: 4.8,
      totalReviews: 0,
      city: 'Cebu City',
      avatarUrl: approvedAvatarUrl,
    }]);
    // The Service Provider's own account id appears nowhere in the answer.
    expect(JSON.stringify(response.body)).not.toContain(approvedProviderUser);
  });
}, 90000);
