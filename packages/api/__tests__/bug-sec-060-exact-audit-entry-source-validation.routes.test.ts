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

import adminRouter from '../src/routes/admin.routes';

it('Bug SEC-060 - an exact audit entry ID without its source is rejected before database access', async () => {
  const entryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const app = express();
  app.use('/admin', adminRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app).get(`/admin/audit-log?entryId=${entryId}`);

  expect(response.status).toBe(400);
  expect(response.body.error).toContain('source is required when entryId is provided');
  expect(dbQueryMock).not.toHaveBeenCalled();
});
