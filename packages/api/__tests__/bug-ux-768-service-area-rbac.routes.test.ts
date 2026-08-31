import express from 'express';
import request from 'supertest';

const createAreaMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/service-area.service', () => ({
  createServiceArea: (...args: unknown[]) => createAreaMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-768 — an ordinary admin cannot create a customer and provider market', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const response = await request(app).post('/admin/service-areas').send({
    name: 'Davao Metro', city: 'Davao City', province: 'Davao del Sur', region: 'Region XI',
    centerLat: 7.0731, centerLng: 125.6128, radiusKm: 20, minProvidersToLaunch: 5,
    reason: 'Preparing the approved provider recruiting market.',
  });

  expect(response.status).toBe(403);
  expect(createAreaMock).not.toHaveBeenCalled();
});
