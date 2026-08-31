import express from 'express';
import request from 'supertest';

const listAreasMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/service-area.service', () => ({
  listServiceAreas: (...args: unknown[]) => listAreasMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-779 — malformed service-area pagination is rejected before the database-backed list', async () => {
  const app = express();
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const response = await request(app).get('/admin/service-areas?page=1.5&pageSize=500');

  expect(response.status).toBe(400);
  expect(listAreasMock).not.toHaveBeenCalled();
});
