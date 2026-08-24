import express from 'express';
import request from 'supertest';

const searchServicesMock = jest.fn().mockResolvedValue([]);
const searchProvidersMock = jest.fn().mockResolvedValue([]);

jest.mock('../src/services/catalog.service', () => ({
  searchServices: (...args: unknown[]) => searchServicesMock(...args),
  searchProviders: (...args: unknown[]) => searchProvidersMock(...args),
}));
jest.mock('../src/middleware/cache.middleware', () => ({
  cacheMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../src/services/cache.service', () => ({
  getRuntimeCacheTtl: jest.fn().mockResolvedValue(60),
  cacheDeletePattern: jest.fn(),
}));

import catalogRouter from '../src/routes/catalog.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug PHASE166-01 — public catalog search rejects queries over 100 characters before executing either database search', async () => {
  const app = express();
  app.use('/catalog', catalogRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(`/catalog/search?q=${'a'.repeat(101)}`);

  expect(response.status).toBe(400);
  expect(response.body.error.message).toMatch(/100 characters/);
  expect(searchServicesMock).not.toHaveBeenCalled();
  expect(searchProvidersMock).not.toHaveBeenCalled();
});
