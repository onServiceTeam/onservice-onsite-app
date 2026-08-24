const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { searchProviders } from '../src/services/catalog.service';
import { getReviewsByProvider } from '../src/services/review.service';

const originalFixtureFlag = process.env.ENABLE_TEST_FIXTURES;

afterAll(() => {
  if (originalFixtureFlag === undefined) delete process.env.ENABLE_TEST_FIXTURES;
  else process.env.ENABLE_TEST_FIXTURES = originalFixtureFlag;
});

it('Bug OPS-210 — public provider search and ratings exclude committed demo fixtures when fixture mode is off', async () => {
  process.env.ENABLE_TEST_FIXTURES = '0';
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM providers p')) {
      const excludesFixtures = sql.includes("NOT LIKE '%@test.ph'");
      return {
        rows: excludesFixtures ? [{
          id: 'real-provider', user_id: 'real-user', business_name: 'Real Provider',
          tier: 'new', rating: '5', total_reviews: 1, city: 'Cebu City', avatar_url: null,
        }] : [{
          id: 'demo-provider', user_id: 'demo-user', business_name: 'Seeded Provider',
          tier: 'elite', rating: '4.9', total_reviews: 96, city: 'Cebu City', avatar_url: null,
        }],
      };
    }

    const excludesDemoReviews = sql.includes("comment NOT LIKE '[demo]%'");
    if (sql.includes('COUNT(*)::text as count')) {
      return { rows: [{ count: excludesDemoReviews ? '1' : '97' }] };
    }
    if (sql.includes('SELECT * FROM reviews')) {
      return { rows: excludesDemoReviews ? [{ id: 'organic-review' }] : [{ id: 'demo-review' }] };
    }
    return {
      rows: [{
        overall: excludesDemoReviews ? '5' : '4.9', quality: null, punctuality: null,
        professionalism: null, communication: null, value: null,
        total_reviews: excludesDemoReviews ? '1' : '97',
      }],
    };
  });

  const providers = await searchProviders('provider');
  const reviews = await getReviewsByProvider('provider-1');

  expect(providers).toEqual([expect.objectContaining({ id: 'real-provider', totalReviews: 1 })]);
  expect(reviews.reviews).toEqual([{ id: 'organic-review' }]);
  expect(reviews.total).toBe(1);
  expect(reviews.aggregate.totalReviews).toBe(1);
});
