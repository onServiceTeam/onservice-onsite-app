import express from 'express';
import request from 'supertest';

const mockGetProviderApplicationAreas = jest.fn();
const mockGetActiveServiceAreas = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../src/middleware/cache.middleware', () => ({
  cacheMiddleware: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock('../src/services/service-area.service', () => ({
  getProviderApplicationAreas: (...args: unknown[]) => mockGetProviderApplicationAreas(...args),
  getActiveServiceAreas: (...args: unknown[]) => mockGetActiveServiceAreas(...args),
  formatServiceArea: (value: unknown) => value,
}));

import serviceAreaRouter from '../src/routes/service-area.routes';

it('Bug UX-530 — provider recruiting markets are exposed separately from customer-bookable service areas', async () => {
  const active = { id: 'area-active', name: 'Metro Cebu', status: 'active' };
  const recruiting = { id: 'area-recruiting', name: 'Davao', status: 'recruiting' };
  mockGetProviderApplicationAreas.mockResolvedValue([active, recruiting]);
  mockGetActiveServiceAreas.mockResolvedValue([active]);

  const app = express();
  app.use('/service-areas', serviceAreaRouter);

  const providerResponse = await request(app).get('/service-areas/provider-markets');
  const customerResponse = await request(app).get('/service-areas/');

  expect(providerResponse.status).toBe(200);
  expect(providerResponse.body.data).toEqual([active, recruiting]);
  expect(customerResponse.status).toBe(200);
  expect(customerResponse.body.data).toEqual([active]);
  expect(mockGetProviderApplicationAreas).toHaveBeenCalledTimes(1);
  expect(mockGetActiveServiceAreas).toHaveBeenCalledTimes(1);
});
