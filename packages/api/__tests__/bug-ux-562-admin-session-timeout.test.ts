import jwt from 'jsonwebtoken';
import type { Response } from 'express';

const queryMock = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: async (work: Parameters<typeof import('../src/models/db').db.transaction>[0]) =>
      work({ query: queryMock }),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTokenPair } from '../src/services/auth.service';
import { setAdminSessionCookies, ADMIN_SESSION_ACCESS_LIFETIME_MS } from '../src/utils/admin-cookies';
import { platformConfig } from '../src/config/platform.config';

it('Bug UX-562 — admin refresh JWT and cookie share the configured session timeout while access stays short-lived', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'ux-562-admin-session-timeout-secret';
  queryMock.mockResolvedValueOnce({ rows: [{ role: 'admin', is_active: true, session_version: 3 }] });
  const tokens = await createTokenPair('admin-562', 'admin', 3);
  const decoded = jwt.decode(tokens.refreshToken) as { iat: number; exp: number; sessionVersion: number };
  expect(decoded.exp - decoded.iat).toBe(platformConfig.adminSessionTimeoutHours * 3600);
  expect(decoded.sessionVersion).toBe(3);

  const cookie = jest.fn();
  await setAdminSessionCookies({ cookie } as unknown as Response, {
    ...tokens,
    adminUserId: 'admin-562',
  });
  const accessOptions = cookie.mock.calls.find(([name]) => name === 'admin_session')?.[2];
  const refreshOptions = cookie.mock.calls.find(([name]) => name === 'admin_refresh')?.[2];
  const csrfOptions = cookie.mock.calls.find(([name]) => name === 'admin_csrf')?.[2];
  expect(accessOptions.maxAge).toBe(ADMIN_SESSION_ACCESS_LIFETIME_MS);
  expect(csrfOptions.maxAge).toBe(ADMIN_SESSION_ACCESS_LIFETIME_MS);
  expect(refreshOptions.maxAge).toBe(platformConfig.adminSessionTimeoutHours * 3600 * 1000);

  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
