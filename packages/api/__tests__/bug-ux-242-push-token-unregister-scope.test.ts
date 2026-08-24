import express from 'express';
import request from 'supertest';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'provider',
    };
    next();
  },
}));

const dbQueryMock = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));

import notificationRouter from '../src/routes/notification.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-242 — unregistering a device deletes only its current authenticated account association', async () => {
  const token = 'ExponentPushToken[one-device]';
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .post('/notifications/push-token/unregister')
    .send({ token });

  expect(response.status).toBe(200);
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
  expect(String(dbQueryMock.mock.calls[0]?.[0])).toMatch(
    /DELETE FROM push_tokens WHERE user_id = \$1 AND token = \$2/,
  );
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([userId, token]);
});
