import express from 'express';
import request from 'supertest';

const mockDbQuery = jest.fn();
const mockDbTransaction = jest.fn();
const mockCacheDeletePattern = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
      iat: 0,
      exp: 0,
    };
    next();
  },
}));
jest.mock('../src/middleware/cache.middleware', () => ({
  cacheMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));
jest.mock('../src/services/cache.service', () => ({
  getRuntimeCacheTtl: jest.fn().mockResolvedValue(60),
  cacheDeletePattern: (...args: unknown[]) => mockCacheDeletePattern(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as catalogService from '../src/services/catalog.service';
import catalogRouter from '../src/routes/catalog.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('MED-N162 - subcategory deactivation is a reasoned, audited transaction reached through the super-admin route', async () => {
  const transactionQuery = jest.fn()
    .mockResolvedValueOnce({
      rows: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        category_id: 'category-med-n162',
        name: 'Home deep cleaning',
        slug: 'home-deep-cleaning',
        is_active: true,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ id: 'audit-med-n162' }], rowCount: 1 });
  mockDbTransaction.mockImplementationOnce(async (
    callback: (client: { query: typeof transactionQuery }) => Promise<unknown>,
  ) => callback({ query: transactionQuery }));

  await catalogService.deleteSubcategory(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Retire this service because the operating scope changed.',
  );

  expect(transactionQuery).toHaveBeenCalledTimes(3);
  expect(transactionQuery.mock.calls[0]![0]).toMatch(/FOR UPDATE/);
  expect(transactionQuery.mock.calls[1]![0]).toMatch(/SET is_active = FALSE/);
  expect(transactionQuery.mock.calls[2]![0]).toContain("'service_subcategory_deleted'");
  expect(transactionQuery.mock.calls[2]![1]).toEqual([
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    JSON.stringify({
      categoryId: 'category-med-n162',
      name: 'Home deep cleaning',
      slug: 'home-deep-cleaning',
    }),
    'Retire this service because the operating scope changed.',
    'Retire this service because the operating scope changed.',
  ]);

  const deleteSpy = jest.spyOn(catalogService, 'deleteSubcategory').mockResolvedValue(undefined);
  const app = express();
  app.use(express.json());
  app.use('/catalog', catalogRouter);
  app.use(errorMiddleware);
  const routeResponse = await request(app)
    .delete('/catalog/admin/subcategories/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    .send({ reason: 'Retire this service because the operating scope changed.' });

  expect(routeResponse.status).toBe(200);
  expect(deleteSpy).toHaveBeenCalledWith(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Retire this service because the operating scope changed.',
  );
  expect(mockCacheDeletePattern).toHaveBeenCalledWith('onservice:http:*/api/v1/catalog*');
});
