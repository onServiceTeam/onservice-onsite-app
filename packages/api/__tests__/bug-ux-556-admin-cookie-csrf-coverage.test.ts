import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockQuery = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { authMiddleware, type AuthenticatedRequest } from '../src/middleware/auth.middleware';

describe('admin cookie CSRF route coverage', () => {
  it('Bug UX-556 — protects cookie-authenticated writes outside /admin while preserving safe and Bearer requests', async () => {
    const priorSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'ux-556-test-secret-that-is-long-enough';

    const token = jwt.sign(
      { userId: '10000000-0000-4000-8000-000000000001', role: 'super_admin', sessionVersion: 1 },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM users/.test(sql)) {
        return Promise.resolve({
          rows: [{ role: 'super_admin', is_active: true, session_version: 1 }],
        });
      }
      if (/FROM admin_csrf_tokens/.test(sql)) {
        return Promise.resolve({
          rows: [{ id: '20000000-0000-4000-8000-000000000001', admin_user_id: '10000000-0000-4000-8000-000000000001' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.all('/api/v1/staff/probe', authMiddleware, (req: AuthenticatedRequest, res) => {
      res.json({ success: true, role: req.user?.role });
    });

    const missingCsrf = await request(app)
      .post('/api/v1/staff/probe')
      .set('Cookie', [`admin_session=${token}`])
      .send({ action: 'change-role' });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body).toMatchObject({ error: { code: 'csrf_invalid' } });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const protectedWrite = await request(app)
      .post('/api/v1/staff/probe')
      .set('Cookie', [`admin_session=${token}`, 'admin_csrf=matching-token'])
      .set('X-CSRF-Token', 'matching-token')
      .send({ action: 'change-role' });
    expect(protectedWrite.status).toBe(200);
    expect(protectedWrite.body).toEqual({ success: true, role: 'super_admin' });
    expect(mockQuery).toHaveBeenCalledTimes(3);

    const safeRead = await request(app)
      .get('/api/v1/staff/probe')
      .set('Cookie', [`admin_session=${token}`]);
    expect(safeRead.status).toBe(200);
    expect(safeRead.body.role).toBe('super_admin');

    const mixedCredentialWrite = await request(app)
      .post('/api/v1/staff/probe')
      .set('Cookie', [`admin_session=${token}`])
      .set('Authorization', 'Bearer attacker-supplied-placeholder')
      .send({ action: 'change-role' });
    expect(mixedCredentialWrite.status).toBe(403);
    expect(mixedCredentialWrite.body).toMatchObject({ error: { code: 'csrf_invalid' } });

    const bearerWrite = await request(app)
      .post('/api/v1/staff/probe')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'change-role' });
    expect(bearerWrite.status).toBe(200);
    expect(bearerWrite.body.role).toBe('super_admin');
    expect(mockQuery).toHaveBeenCalledTimes(6);

    if (priorSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorSecret;
  });
});
