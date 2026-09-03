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

it('Bug SEC-036 — a flagged admin can only inspect identity, rotate the password, or log out', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'sec-036-password-rotation-test-secret';
  const userId = '10000000-0000-4000-8000-000000000036';
  const account = {
    role: 'admin',
    is_active: true,
    session_version: 4,
    must_rotate_password: true,
  };
  queryMock.mockImplementation(() => Promise.resolve({ rows: [{ ...account }] }));

  const sign = (role: 'admin' | 'customer'): string => jwt.sign(
    { userId, role, sessionVersion: 4 },
    process.env.JWT_SECRET!,
    { expiresIn: '5m' },
  );
  const app = express();
  const ok = (req: AuthenticatedRequest, res: express.Response): void => {
    res.json({ success: true, role: req.user?.role });
  };
  app.get('/api/v1/operations/probe', authMiddleware, ok);
  app.get('/api/v1/auth/me', authMiddleware, ok);
  app.post('/api/v1/security/admin/me/change-password', authMiddleware, ok);
  app.post('/api/v1/auth/admin/logout', authMiddleware, ok);
  app.use(errorMiddleware);

  try {
    const blocked = await request(app)
      .get('/api/v1/operations/probe')
      .set('Authorization', `Bearer ${sign('admin')}`);
    expect(blocked.status).toBe(428);
    expect(blocked.body).toMatchObject({
      success: false,
      error: {
        statusCode: 428,
        code: 'password_rotation_required',
      },
    });

    const identity = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sign('admin')}`);
    const rotation = await request(app)
      .post('/api/v1/security/admin/me/change-password')
      .set('Authorization', `Bearer ${sign('admin')}`);
    const logout = await request(app)
      .post('/api/v1/auth/admin/logout')
      .set('Authorization', `Bearer ${sign('admin')}`);
    expect([identity.status, rotation.status, logout.status]).toEqual([200, 200, 200]);

    account.role = 'customer';
    const customer = await request(app)
      .get('/api/v1/operations/probe')
      .set('Authorization', `Bearer ${sign('customer')}`);
    expect(customer.status).toBe(200);
    expect(customer.body.role).toBe('customer');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
