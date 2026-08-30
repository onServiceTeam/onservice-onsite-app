import type { NextFunction, Request, Response } from 'express';

const mockQuery = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { requireAdminCsrf } from '../src/middleware/admin-csrf.middleware';

it('Bug UX-557 — a valid CSRF token is accepted only for the authenticated admin who owns it', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/staff/roles',
    ip: '127.0.0.1',
    user: { userId: 'admin-b' },
    cookies: { admin_session: 'signed-session-b', admin_csrf: 'token-owned-by-admin-a' },
    header: (name: string) => name.toLowerCase() === 'x-csrf-token' ? 'token-owned-by-admin-a' : undefined,
  } as unknown as Request;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  } as unknown as Response & { statusCode: number; body: unknown };
  const next = jest.fn() as NextFunction;

  await requireAdminCsrf(req, res, next);

  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('admin_user_id = $2'), [
    'token-owned-by-admin-a',
    'admin-b',
  ]);
  expect(res.statusCode).toBe(403);
  expect(res.body).toMatchObject({ error: { code: 'csrf_invalid' } });
  expect(next).not.toHaveBeenCalled();
});
