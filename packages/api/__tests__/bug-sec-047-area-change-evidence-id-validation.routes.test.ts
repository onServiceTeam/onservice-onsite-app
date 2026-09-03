import express from 'express';
import request from 'supertest';

const getByIdMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin',
    };
    next();
  },
}));
jest.mock('../src/services/service-area-change.service', () => ({
  getById: (...args: unknown[]) => getByIdMock(...args),
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-047 - exact area-change evidence rejects a malformed target ID before querying the service', async () => {
  const app = express();
  app.use('/admin', adminLatentRouter);
  app.use(errorMiddleware);

  const response = await request(app).get('/admin/service-area-changes/not-a-request');

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    success: false,
    error: { message: 'changeId must be a valid UUID.', statusCode: 400 },
  });
  expect(getByIdMock).not.toHaveBeenCalled();
});
