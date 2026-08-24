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

it('Bug UX-297 — repeated public search filter parameters are rejected instead of silently bypassing the requested filter', async () => {
  const app = express();
  app.use('/catalog', catalogRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .get('/catalog/search?q=clean&categories=aircon&categories=plumbing');

  expect(response.status).toBe(400);
  expect(response.body.error.message).toMatch(/categories are invalid/i);
  expect(searchServicesMock).not.toHaveBeenCalled();
  expect(searchProvidersMock).not.toHaveBeenCalled();
});
