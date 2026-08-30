import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const dbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { call: jest.fn(), status: 'ready' },
}));
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    increment: jest.fn(),
    decrement: jest.fn(),
    resetKey: jest.fn(),
  })),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { adminAuthOrSetupToken } from '../src/routes/auth.routes';

it('Bug UX-574 — admin setup authentication reports a canonical-state outage as 500, not invalid credentials', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'ux-574-admin-setup-session-secret';
  dbQuery.mockRejectedValue(new Error('database unavailable'));
  const token = jwt.sign({
    userId: '10000000-0000-4000-8000-000000000574',
    role: 'dpo',
    sessionVersion: 2,
    type: 'pre_auth_2fa_setup',
  }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const app = express();
  app.get('/probe', adminAuthOrSetupToken, (_req, res) => res.json({ success: true }));
  app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  try {
    const response = await request(app).get('/probe').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/unable to validate/i);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
