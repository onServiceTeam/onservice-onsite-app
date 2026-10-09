import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
let authenticatedRole: 'admin' | 'customer' = 'admin';

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: jest.fn(() => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next()),
}));
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { call: jest.fn(), status: 'ready' },
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request & { user?: unknown },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.user = {
      userId: '10000000-0000-4000-8000-000000000043',
      role: authenticatedRole,
      sessionVersion: 1,
    };
    next();
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-043 — admin 2FA disable fails closed without reading or mutating factor state', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorMiddleware);

  authenticatedRole = 'customer';
  const forbidden = await request(app)
    .post('/auth/admin/2fa/disable')
    .send({ totpCode: '123456' });
  expect(forbidden.status).toBe(403);

  authenticatedRole = 'admin';
  const held = await request(app)
    .post('/auth/admin/2fa/disable')
    .send({ totpCode: '123456' });
  expect(held.status).toBe(409);
  expect(held.body.error.code).toBe('privileged_recovery_policy_required');
  expect(dbQueryMock).not.toHaveBeenCalled();
});
