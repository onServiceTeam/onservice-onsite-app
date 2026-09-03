import express from 'express';
import request from 'supertest';

const getByIdMock = jest.fn();
const changeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'customer',
    };
    next();
  },
}));
jest.mock('../src/services/service-area-change.service', () => ({
  getById: (...args: unknown[]) => getByIdMock(...args),
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-048 - exact provider area-change evidence rejects non-admin accounts before loading the record', async () => {
  const app = express();
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);

  const response = await request(app).get(`/admin/service-area-changes/${changeId}`);

  expect(response.status).toBe(403);
  expect(getByIdMock).not.toHaveBeenCalled();
});
