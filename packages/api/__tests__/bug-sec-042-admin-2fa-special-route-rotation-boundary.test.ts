import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const queryMock = jest.fn();

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
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { adminAuthOrSetupToken } from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-042 — the 2FA setup boundary blocks a rotation-flagged access session but permits its dedicated setup token', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'sec-042-special-route-rotation-secret';
  const userId = '10000000-0000-4000-8000-000000000042';
  queryMock.mockResolvedValue({
    rows: [{
      role: 'admin',
      is_active: true,
      session_version: 5,
      must_rotate_password: true,
    }],
  });

  const sign = (type?: 'access' | 'pre_auth_2fa_setup'): string => jwt.sign({
    userId,
    role: 'admin',
    sessionVersion: 5,
    ...(type ? { type } : {}),
  }, process.env.JWT_SECRET!, { expiresIn: '5m' });
  const app = express();
  app.post('/auth/admin/2fa/setup', adminAuthOrSetupToken, (_req, res) => {
    res.json({ success: true });
  });
  app.use(errorMiddleware);

  try {
    const blocked = await request(app)
      .post('/auth/admin/2fa/setup')
      .set('Authorization', `Bearer ${sign('access')}`);
    expect(blocked.status).toBe(428);
    expect(blocked.body.error.code).toBe('password_rotation_required');

    const setup = await request(app)
      .post('/auth/admin/2fa/setup')
      .set('Authorization', `Bearer ${sign('pre_auth_2fa_setup')}`);
    expect(setup.status).toBe(200);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
