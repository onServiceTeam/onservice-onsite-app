import express from 'express';
import request from 'supertest';

const computeMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/admin-analytics.service', () => ({
  computeProviderQualityScores: (...args: unknown[]) => computeMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-826 — the admin API holds quality recomputation before conflicting definitions can replace snapshots', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .post('/admin/analytics/quality-scores/compute')
    .send({ periodDays: 90 });

  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/E47/);
  expect(computeMock).not.toHaveBeenCalled();
});
