import express from 'express';
import request from 'supertest';

const updateAreaMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
    };
    next();
  },
}));
jest.mock('../src/services/service-area.service', () => ({
  updateServiceArea: (...args: unknown[]) => updateAreaMock(...args),
}));

import adminRouter from '../src/routes/admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-769 — a malformed service-area ID is rejected before lifecycle work', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .post('/admin/service-areas/not-a-uuid/activate')
    .send({ reason: 'Capacity and launch readiness were reviewed.' });

  expect(response.status).toBe(400);
  expect(updateAreaMock).not.toHaveBeenCalled();
});
