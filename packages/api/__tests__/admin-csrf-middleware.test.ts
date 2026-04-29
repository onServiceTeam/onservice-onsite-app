// Bug 1251 fix verified.
// Phase 14 Dispatch 01.
//
// Verifies the admin CSRF middleware enforces double-submit cookie/header
// matching AND DB-backed token validity, while leaving safe methods alone.

import type { Request, Response, NextFunction } from 'express';

// Mock the db module before importing the middleware (the middleware reads
// from `../models/db` at top-level).
const mockQuery = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Mock logger so warnings don't pollute test output.
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { requireAdminCsrf } from '../src/middleware/admin-csrf.middleware';

interface FakeReq {
  method: string;
  header: (name: string) => string | undefined;
  cookies: Record<string, string>;
  ip?: string;
  originalUrl?: string;
}

function makeReq(opts: {
  method?: string;
  headerToken?: string;
  cookieToken?: string;
}): FakeReq {
  const headers: Record<string, string> = {};
  if (opts.headerToken !== undefined) headers['x-csrf-token'] = opts.headerToken;
  return {
    method: opts.method ?? 'POST',
    header: (name: string) => headers[name.toLowerCase()],
    cookies: opts.cookieToken !== undefined ? { admin_csrf: opts.cookieToken } : {},
    ip: '127.0.0.1',
    originalUrl: '/api/v1/admin/test',
  };
}

function makeRes(): {
  status: jest.Mock;
  json: jest.Mock;
  statusCode: number;
  body: unknown;
} {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: jest.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (this: { body: unknown }, payload: unknown) {
      this.body = payload;
      return this;
    }),
  } as unknown as { status: jest.Mock; json: jest.Mock; statusCode: number; body: unknown };
  return res;
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('Bug 1251 fix verified — requireAdminCsrf', () => {
  it('GET request bypasses the CSRF check', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('HEAD request bypasses the CSRF check', async () => {
    const req = makeReq({ method: 'HEAD' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('OPTIONS request bypasses the CSRF check', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST without header token → 403 csrf_invalid', async () => {
    const req = makeReq({ method: 'POST', cookieToken: 'abc' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'csrf_invalid' } });
    expect(next).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST without cookie token → 403 csrf_invalid', async () => {
    const req = makeReq({ method: 'POST', headerToken: 'abc' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'csrf_invalid' } });
    expect(next).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST with cookie/header mismatch → 403 csrf_invalid (does NOT hit DB)', async () => {
    const req = makeReq({ method: 'POST', headerToken: 'attacker-value', cookieToken: 'real-value' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    // Mismatch must short-circuit before any DB lookup.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST with matching tokens but unknown in DB → 403 csrf_invalid', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = makeReq({ method: 'POST', headerToken: 'matching-but-fake', cookieToken: 'matching-but-fake' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'csrf_invalid' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('POST with matching tokens AND valid DB row → next() with no args', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'csrf-id-1', admin_user_id: 'admin-1' }] });
    const req = makeReq({ method: 'POST', headerToken: 'good-token', cookieToken: 'good-token' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    // Verify the DB lookup is constrained: not revoked, not expired.
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toMatch(/revoked_at IS NULL/);
    expect(sql).toMatch(/expires_at > NOW\(\)/);
  });

  it('PUT/PATCH/DELETE all enforce the check (sample: PATCH)', async () => {
    const req = makeReq({ method: 'PATCH' });
    const res = makeRes();
    const next = jest.fn();

    await requireAdminCsrf(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
