import express from 'express';
import request from 'supertest';

const mockDbQuery = jest.fn(async (sql: string) => {
  if (sql.includes('FROM service_subcategories sc')) {
    return {
      rows: [{
        id: 'service-1', category_id: 'category-1', name: 'Aircon cleaning', slug: 'aircon-cleaning',
        description: 'Clean the unit', pricing_type: 'fixed', base_price: 100000,
        min_price: null, max_price: null, estimated_duration_minutes: 60, display_order: 1,
        category_name: 'Aircon', category_slug: 'aircon',
      }],
    };
  }
  return {
    rows: [{
      id: 'provider-1', user_id: 'user-1', business_name: 'Clean Pro', tier: 'verified',
      rating: '4.8', total_reviews: 12, city: 'Cebu City', avatar_url: null,
    }],
  };
});

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));
jest.mock('../src/middleware/cache.middleware', () => ({
  cacheMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/services/cache.service', () => ({
  getRuntimeCacheTtl: jest.fn().mockResolvedValue(60),
  cacheDeletePattern: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import catalogRouter from '../src/routes/catalog.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-272 — catalog search validates and executes category/rating filters while clamping a hostile result limit', async () => {
  const app = express();
  app.use('/catalog', catalogRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get('/catalog/search?q=clean&categories=aircon,plumbing,aircon&minRating=4.5&limit=-9');

  expect(response.status).toBe(200);
  expect(response.body.data.services).toHaveLength(1);
  expect(response.body.data.providers).toHaveLength(1);
  const serviceCall = mockDbQuery.mock.calls.find(([sql]) => String(sql).includes('FROM service_subcategories sc'));
  const providerCall = mockDbQuery.mock.calls.find(([sql]) => String(sql).includes('FROM providers p'));
  expect(serviceCall?.[0]).toMatch(/c\.slug = ANY\(\$3::text\[\]\)/);
  expect(serviceCall?.[1]).toEqual(['%clean%', 1, ['aircon', 'plumbing']]);
  expect(providerCall?.[0]).toMatch(/p\.rating >= \$4::numeric/);
  expect(providerCall?.[1]).toEqual(['%clean%', 1, ['aircon', 'plumbing'], 4.5]);

  const callsBeforeInvalid = mockDbQuery.mock.calls.length;
  const invalid = await request(app).get('/catalog/search?q=clean&categories=bad_slug&minRating=9');
  expect(invalid.status).toBe(400);
  expect(mockDbQuery).toHaveBeenCalledTimes(callsBeforeInvalid);
});
