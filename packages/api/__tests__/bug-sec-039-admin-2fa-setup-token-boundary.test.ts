import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  authMiddleware,
  type AuthenticatedRequest,
} from '../src/middleware/auth.middleware';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-039 — a pre-auth 2FA setup token cannot authorize ordinary protected APIs', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'sec-039-setup-token-boundary-secret';
  const userId = '10000000-0000-4000-8000-000000000039';
  queryMock.mockResolvedValue({
    rows: [{
      role: 'admin',
      is_active: true,
      session_version: 2,
      must_rotate_password: false,
    }],
  });

  const app = express();
  app.get('/api/v1/operations/probe', authMiddleware, (
    req: AuthenticatedRequest,
    res,
  ) => res.json({ success: true, role: req.user?.role }));
  app.use(errorMiddleware);

  const setupToken = jwt.sign({
    userId,
    role: 'admin',
    sessionVersion: 2,
    type: 'pre_auth_2fa_setup',
  }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const accessToken = jwt.sign({
    userId,
    role: 'admin',
    sessionVersion: 2,
  }, process.env.JWT_SECRET, { expiresIn: '5m' });

  try {
    const blocked = await request(app)
      .get('/api/v1/operations/probe')
      .set('Authorization', `Bearer ${setupToken}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.message).toBe('Invalid authentication token.');

    const ordinaryAccess = await request(app)
      .get('/api/v1/operations/probe')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ordinaryAccess.status).toBe(200);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
