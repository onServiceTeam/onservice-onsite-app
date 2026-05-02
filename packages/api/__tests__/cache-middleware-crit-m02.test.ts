// CRIT-M02 fix verified — cacheMiddleware now keys by user identity
// when present, and bypasses caching entirely when authentication
// credentials are present but identity hasn't been resolved yet
// (defense-in-depth fail-closed against accidental middleware-order
// regressions).
//
// Pre-fix: key = buildCacheKey('http', req.originalUrl). Cross-user
// data leak risk if the middleware is mounted on an authenticated
// route — first user to hit the URL populated the cache, every
// subsequent user got their data back.
//
// Post-fix: key folds in `req.user.userId` and `req.user.role` so
// different users receive different cache entries; missing-identity
// + auth-header-present causes a fail-closed BYPASS.

const cacheGetMock = jest.fn();
const cacheSetMock = jest.fn();

jest.mock('../src/services/cache.service', () => ({
  cacheGet: (...args: unknown[]) => cacheGetMock(...args),
  cacheSet: (...args: unknown[]) => cacheSetMock(...args),
  buildCacheKey: (ns: string, suffix: string) => `${ns}:${suffix}`,
}));

import { cacheMiddleware } from '../src/middleware/cache.middleware';
import type { Request, Response, NextFunction } from 'express';

function makeReq(overrides: Partial<Request> & {
  user?: { userId: string; role: string };
  cookies?: Record<string, string>;
} = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/notifications',
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & { _captured: { body?: unknown; status?: number; headers: Record<string, string> } } {
  const captured: { body?: unknown; status?: number; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    statusCode: 200,
    _captured: captured,
    set: jest.fn((k: string, v: string) => {
      captured.headers[k] = v;
      return res;
    }),
    status: jest.fn((s: number) => {
      captured.status = s;
      res.statusCode = s;
      return res;
    }),
    json: jest.fn((b: unknown) => {
      captured.body = b;
      return res;
    }),
  } as unknown as Response & typeof captured;
  return res as Response & { _captured: typeof captured };
}

describe('CRIT-M02 — cacheMiddleware keys by user identity', () => {
  beforeEach(() => {
    cacheGetMock.mockReset();
    cacheSetMock.mockReset();
    cacheSetMock.mockResolvedValue(undefined);
  });

  it('produces DIFFERENT cache keys for two different authenticated users on the same URL', async () => {
    cacheGetMock.mockResolvedValue(null); // miss for both

    const userA = { user: { userId: 'user-A-id', role: 'customer' } };
    const userB = { user: { userId: 'user-B-id', role: 'customer' } };

    const mw = cacheMiddleware(60);
    const next = jest.fn();

    const reqA = makeReq(userA);
    const resA = makeRes();
    await mw(reqA, resA, next as NextFunction);
    // Trigger the wrapped json() to write to cache.
    resA.json({ secret: 'A-only' });

    const reqB = makeReq(userB);
    const resB = makeRes();
    await mw(reqB, resB, next as NextFunction);
    resB.json({ secret: 'B-only' });

    // cacheGet was called with two different keys.
    const getKeys = cacheGetMock.mock.calls.map((c) => c[0] as string);
    expect(getKeys).toHaveLength(2);
    expect(getKeys[0]).not.toEqual(getKeys[1]);
    expect(getKeys[0]).toContain('user-A-id');
    expect(getKeys[1]).toContain('user-B-id');

    // cacheSet was called with two different keys for the two responses.
    const setKeys = cacheSetMock.mock.calls.map((c) => c[0] as string);
    expect(setKeys).toHaveLength(2);
    expect(setKeys[0]).not.toEqual(setKeys[1]);
  });

  it('user A cannot see user B\'s cached body even on the same URL (HIT only matches own key)', async () => {
    const userA = { user: { userId: 'user-A-id', role: 'customer' } };
    const userB = { user: { userId: 'user-B-id', role: 'customer' } };

    // Pretend user A's body is already cached. cacheGet returns it
    // ONLY when the key contains 'user-A-id'; otherwise null.
    cacheGetMock.mockImplementation(async (key: string) => {
      if (key.includes('user-A-id')) {
        return { body: { secret: 'A-only' }, statusCode: 200 };
      }
      return null;
    });

    const mw = cacheMiddleware(60);
    const next = jest.fn();

    // User B hits the same URL. They MUST miss (or we have a leak).
    const reqB = makeReq(userB);
    const resB = makeRes();
    await mw(reqB, resB, next as NextFunction);

    // If the fix works, B saw a cache miss and next() was called,
    // because the key contained 'user-B-id' not 'user-A-id'.
    expect(next).toHaveBeenCalled();
    expect(resB._captured.body).toBeUndefined();

    // User A on the same URL MUST hit and get their own data back.
    const reqA = makeReq(userA);
    const resA = makeRes();
    await mw(reqA, resA, next as NextFunction);

    expect(resA._captured.body).toEqual({ secret: 'A-only' });
    expect(resA._captured.headers['X-Cache']).toBe('HIT');
  });

  it('BYPASSES the cache when Authorization header is present but req.user is not yet populated', async () => {
    // Simulates a route mounted as: cacheMiddleware THEN authMiddleware.
    // Without the fail-closed defense-in-depth, the first such request
    // would populate cache with whatever data the route returned,
    // leaking it across all callers.
    const req = makeReq({
      headers: { authorization: 'Bearer some-jwt-token' },
      // intentionally no user attached
    });
    const res = makeRes();
    const mw = cacheMiddleware(60);
    const next = jest.fn();

    await mw(req, res, next as NextFunction);

    // No cache get attempted.
    expect(cacheGetMock).not.toHaveBeenCalled();
    // Response is marked as bypassed and request flows through.
    expect(res._captured.headers['X-Cache']).toBe('BYPASS');
    expect(next).toHaveBeenCalled();
  });

  it('BYPASSES the cache when admin_session cookie is present but req.user is not yet populated', async () => {
    const req = makeReq({
      cookies: { admin_session: 'some-jwt-token' },
    });
    const res = makeRes();
    const mw = cacheMiddleware(60);
    const next = jest.fn();

    await mw(req, res, next as NextFunction);

    expect(cacheGetMock).not.toHaveBeenCalled();
    expect(res._captured.headers['X-Cache']).toBe('BYPASS');
    expect(next).toHaveBeenCalled();
  });

  it('still caches public unauthenticated GETs (anon scope) — the fix does not break catalog/service-area perf wins', async () => {
    cacheGetMock.mockResolvedValueOnce(null); // miss
    const req = makeReq({ originalUrl: '/api/v1/catalog/categories' });
    const res = makeRes();
    const mw = cacheMiddleware(120);
    const next = jest.fn();

    await mw(req, res, next as NextFunction);
    res.json([{ id: '1' }, { id: '2' }]);

    expect(cacheGetMock).toHaveBeenCalledWith(expect.stringContaining('anon'));
    expect(cacheSetMock).toHaveBeenCalledWith(
      expect.stringContaining('anon'),
      expect.objectContaining({ statusCode: 200 }),
      120,
    );
  });

  it('uses Cache-Control: private for authenticated cached responses (must not be stored by shared CDNs)', async () => {
    cacheGetMock.mockResolvedValueOnce({
      body: { ok: true },
      statusCode: 200,
    });
    const req = makeReq({ user: { userId: 'u1', role: 'customer' } });
    const res = makeRes();
    const mw = cacheMiddleware(60);
    const next = jest.fn();

    await mw(req, res, next as NextFunction);

    // Cache-Control must include 'private' so CDN/proxy won't share it.
    expect(res._captured.headers['Cache-Control']).toContain('private');
  });

  it('uses Cache-Control: public for anon cached responses (CDN-friendly)', async () => {
    cacheGetMock.mockResolvedValueOnce({
      body: { ok: true },
      statusCode: 200,
    });
    const req = makeReq({ originalUrl: '/api/v1/catalog/categories' });
    const res = makeRes();
    const mw = cacheMiddleware(60);
    const next = jest.fn();

    await mw(req, res, next as NextFunction);

    expect(res._captured.headers['Cache-Control']).toContain('public');
  });

  it('non-GET requests pass through with no cache interaction (existing behavior preserved)', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    const mw = cacheMiddleware(60);
    const next = jest.fn();

    await mw(req, res, next as NextFunction);

    expect(cacheGetMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
