import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const clientQueryMock = jest.fn();

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
    transaction: (fn: (client: { query: typeof clientQueryMock }) => Promise<unknown>) => (
      dbTransactionMock(fn)
    ),
  },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request & { user?: unknown },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.user = {
      userId: '10000000-0000-4000-8000-000000000371',
      role: 'customer',
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

it('Bug OPS-371 — a shared profile name update and its before/after audit commit through one transaction', async () => {
  const before = {
    id: '10000000-0000-4000-8000-000000000371',
    phone: '+639171234567',
    email: null,
    first_name: 'Maria',
    last_name: 'Reyes',
    role: 'customer',
    avatar_url: null,
    is_verified: true,
    is_active: true,
    session_version: 1,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };
  const after = { ...before, first_name: 'Ana', last_name: 'Santos' };
  clientQueryMock
    .mockResolvedValueOnce({ rows: [before], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [after], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'audit-371' }], rowCount: 1 });
  dbTransactionMock.mockImplementation(async (
    fn: (client: { query: typeof clientQueryMock }) => Promise<unknown>,
  ) => fn({ query: clientQueryMock }));

  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorMiddleware);
  const response = await request(app)
    .patch('/auth/me')
    .set('User-Agent', 'profile-audit-test')
    .send({ firstName: 'Ana', lastName: 'Santos' });

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ firstName: 'Ana', lastName: 'Santos' });
  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(clientQueryMock).toHaveBeenCalledTimes(3);
  expect(clientQueryMock.mock.calls[0]![0]).toMatch(/FOR UPDATE/);
  expect(clientQueryMock.mock.calls[1]![0]).toMatch(/UPDATE users/);
  expect(clientQueryMock.mock.calls[2]![0]).toMatch(/INSERT INTO audit_log/);
  expect(clientQueryMock.mock.calls[2]![1]).toEqual(expect.arrayContaining([
    JSON.stringify({ firstName: 'Maria', lastName: 'Reyes' }),
    JSON.stringify({ firstName: 'Ana', lastName: 'Santos' }),
    'profile-audit-test',
  ]));
});
