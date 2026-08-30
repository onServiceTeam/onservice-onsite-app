import express from 'express';
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

it('Bug UX-558 — protected requests reject stale role, generation, and inactive account state', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'ux-558-canonical-session-secret';
  const account = {
    role: 'dpo',
    is_active: true,
    session_version: 2,
  };
  mockQuery.mockImplementation(() => Promise.resolve({ rows: [{ ...account }] }));

  const token = jwt.sign(
    { userId: '10000000-0000-4000-8000-000000000558', role: 'dpo', sessionVersion: 2 },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );
  const app = express();
  app.get('/probe', authMiddleware, (req: AuthenticatedRequest, res) => {
    res.json({ role: req.user?.role, sessionVersion: req.user?.sessionVersion });
  });
  app.use((error: Error & { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ code: error.code, message: error.message });
  });

  const current = await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
  expect(current.status).toBe(200);
  expect(current.body).toEqual({ role: 'dpo', sessionVersion: 2 });

  account.role = 'admin';
  const staleRole = await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
  expect(staleRole.status).toBe(401);
  expect(staleRole.body.code).toBe('session_revoked');

  account.role = 'dpo';
  account.session_version = 3;
  const staleGeneration = await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
  expect(staleGeneration.status).toBe(401);
  expect(staleGeneration.body.code).toBe('session_revoked');

  account.session_version = 2;
  account.is_active = false;
  const inactive = await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
  expect(inactive.status).toBe(401);
  expect(inactive.body.code).toBe('session_revoked');

  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
