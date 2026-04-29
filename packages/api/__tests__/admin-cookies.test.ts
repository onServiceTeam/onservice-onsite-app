// Bug 1251 fix verified.
// Phase 14 Dispatch 01.
//
// Verifies the admin-cookies helpers issue HttpOnly session + refresh cookies,
// a JS-readable CSRF cookie, and persist the CSRF token row to the database.

import type { Response } from 'express';

const mockQuery = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Stub the platform config so tests don't depend on env-derived defaults.
jest.mock('../src/config/platform.config', () => ({
  platformConfig: { adminSessionTimeoutHours: 1 },
}));

import {
  setAdminSessionCookies,
  clearAdminSessionCookies,
  revokeAdminCsrfTokens,
  ADMIN_SESSION_ACCESS_LIFETIME_MS,
} from '../src/utils/admin-cookies';

interface CookieCall {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    path?: string;
    maxAge?: number;
  };
}

function makeRes(): { res: Response; cookieCalls: CookieCall[]; clearCalls: { name: string; options: Record<string, unknown> }[] } {
  const cookieCalls: CookieCall[] = [];
  const clearCalls: { name: string; options: Record<string, unknown> }[] = [];
  const res = {
    cookie: (name: string, value: string, options: CookieCall['options']) => {
      cookieCalls.push({ name, value, options });
      return res;
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      clearCalls.push({ name, options });
      return res;
    },
  } as unknown as Response;
  return { res, cookieCalls, clearCalls };
}

beforeEach(() => {
  mockQuery.mockReset();
  delete process.env.NODE_ENV;
});

describe('Bug 1251 fix verified — setAdminSessionCookies', () => {
  it('issues three cookies with the documented attributes (non-prod)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT admin_csrf_tokens
    const { res, cookieCalls } = makeRes();

    const { csrfToken } = await setAdminSessionCookies(res, {
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      adminUserId: 'admin-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{40,}$/); // base64url, ~43 chars
    expect(cookieCalls).toHaveLength(3);

    const session = cookieCalls.find((c) => c.name === 'admin_session')!;
    expect(session.value).toBe('access.jwt');
    expect(session.options.httpOnly).toBe(true);
    expect(session.options.sameSite).toBe('strict');
    expect(session.options.path).toBe('/api');
    expect(session.options.secure).toBe(false); // non-prod
    expect(session.options.maxAge).toBe(15 * 60 * 1000);

    const refresh = cookieCalls.find((c) => c.name === 'admin_refresh')!;
    expect(refresh.value).toBe('refresh.jwt');
    expect(refresh.options.httpOnly).toBe(true);
    expect(refresh.options.sameSite).toBe('strict');
    expect(refresh.options.path).toBe('/api/v1/auth/admin/refresh');
    expect(refresh.options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);

    const csrfCookie = cookieCalls.find((c) => c.name === 'admin_csrf')!;
    expect(csrfCookie.value).toBe(csrfToken);
    expect(csrfCookie.options.httpOnly).toBe(false);
    expect(csrfCookie.options.sameSite).toBe('strict');
    expect(csrfCookie.options.path).toBe('/');
  });

  it('marks cookies Secure in production', async () => {
    process.env.NODE_ENV = 'production';
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { res, cookieCalls } = makeRes();

    await setAdminSessionCookies(res, {
      accessToken: 'a',
      refreshToken: 'r',
      adminUserId: 'admin-1',
    });

    for (const c of cookieCalls) {
      expect(c.options.secure).toBe(true);
    }
  });

  it('persists the CSRF token row with admin_user_id, ip, user agent and expiry', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { res } = makeRes();

    await setAdminSessionCookies(res, {
      accessToken: 'a',
      refreshToken: 'r',
      adminUserId: 'admin-42',
      ipAddress: '1.2.3.4',
      userAgent: 'PlaywrightTest/1.0',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO admin_csrf_tokens/);
    expect(params).toEqual([
      'admin-42',
      expect.stringMatching(/^[A-Za-z0-9_-]{40,}$/),
      '1.2.3.4',
      'PlaywrightTest/1.0',
      expect.any(Date),
    ]);
    // Expiry must be ~15 minutes from now.
    const expiresAt = (params as unknown[])[4] as Date;
    const deltaMs = expiresAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(14 * 60 * 1000);
    expect(deltaMs).toBeLessThan(16 * 60 * 1000);
  });

  it('exports a session lifetime no longer than 15 minutes', () => {
    expect(ADMIN_SESSION_ACCESS_LIFETIME_MS).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});

describe('Bug 1251 fix verified — clearAdminSessionCookies', () => {
  it('clears all three cookies with paths matching the issuer (browser drop semantics)', () => {
    const { res, clearCalls } = makeRes();
    clearAdminSessionCookies(res);

    expect(clearCalls).toHaveLength(3);
    expect(clearCalls.find((c) => c.name === 'admin_session')!.options).toMatchObject({ path: '/api' });
    expect(clearCalls.find((c) => c.name === 'admin_refresh')!.options).toMatchObject({ path: '/api/v1/auth/admin/refresh' });
    expect(clearCalls.find((c) => c.name === 'admin_csrf')!.options).toMatchObject({ path: '/' });
  });
});

describe('Bug 1251 fix verified — revokeAdminCsrfTokens', () => {
  it('marks all live tokens for the admin as revoked', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await revokeAdminCsrfTokens('admin-99');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toMatch(/UPDATE admin_csrf_tokens/);
    expect(sql).toMatch(/SET revoked_at = NOW\(\)/);
    expect(sql).toMatch(/WHERE admin_user_id = \$1/);
    expect(sql).toMatch(/AND revoked_at IS NULL/);
    expect(params).toEqual(['admin-99']);
  });
});
