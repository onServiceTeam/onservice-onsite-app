import express from 'express';
import request from 'supertest';

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'customer',
    };
    next();
  },
}));

const registerPushTokenMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  registerPushToken: (...args: unknown[]) => registerPushTokenMock(...args),
}));

import notificationRouter from '../src/routes/notification.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug PHASE157-01 — push-token registration rejects payloads over 256 characters', async () => {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .post('/notifications/push-token')
    .send({ token: 'x'.repeat(257), platform: 'android' });

  expect(response.status).toBe(400);
  expect(response.body.error.message).toMatch(/256 characters/);
  expect(registerPushTokenMock).not.toHaveBeenCalled();
});
