import express from 'express';
import request from 'supertest';

const authRateLimitMock = jest.fn((
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  res.status(429).json({ success: false, error: { message: 'Live authentication limit reached.' } });
});

jest.mock('../src/middleware/rate-limit.middleware', () => ({
  authRateLimitMiddleware: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => { authRateLimitMock(req, res, next); },
}));
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/services/auth.service', () => ({}));
jest.mock('../src/services/security.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';

it('Bug SEC-031 — every OTP and admin credential-attempt boundary uses the live authentication limiter', async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);

  const paths = [
    '/auth/send-otp',
    '/auth/verify-otp',
    '/auth/admin/login',
    '/auth/admin/2fa/verify',
  ];

  for (const path of paths) {
    const response = await request(app).post(path).send({});
    expect(response.status).toBe(429);
    expect(response.body.error.message).toBe('Live authentication limit reached.');
  }
  expect(authRateLimitMock).toHaveBeenCalledTimes(paths.length);
});
