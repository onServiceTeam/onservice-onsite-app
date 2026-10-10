import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'super_admin',
      iat: 0,
      exp: 0,
    };
    next();
  },
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import adminLatentRouter from '../src/routes/admin-latent.routes';

it('Bug SEC-061 - the raw audit PII reveal rejects a malformed row ID before database access', async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminLatentRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app)
    .post('/admin/audit-log/not-a-uuid/reveal-pii')
    .send({ reason: 'Investigating a documented privacy request.' });

  expect(response.status).toBe(400);
  expect(response.body.error).toContain('auditLogId must be a valid UUID');
  expect(dbQueryMock).not.toHaveBeenCalled();
});
