import express from 'express';
import request from 'supertest';

const getAreaBySlugMock = jest.fn().mockResolvedValue({
  id: 'area-1', slug: 'davao-recruiting', status: 'recruiting',
});

jest.mock('../src/services/service-area.service', () => ({
  getServiceAreaBySlug: (...args: unknown[]) => getAreaBySlugMock(...args),
  formatServiceArea: (area: unknown) => area,
}));
jest.mock('../src/middleware/cache.middleware', () => ({
  cacheMiddleware: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import serviceAreaRouter from '../src/routes/service-area.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-776 — a recruiting-only market is not exposed as customer coverage by its public slug', async () => {
  const app = express();
  app.use('/service-areas', serviceAreaRouter);
  app.use(errorMiddleware);

  const response = await request(app).get('/service-areas/davao-recruiting');

  expect(response.status).toBe(404);
  expect(getAreaBySlugMock).toHaveBeenCalledWith('davao-recruiting');
});
