import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request, { Response as SupertestResponse } from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const verifyPasswordWithRehashMock = jest.fn();
const createTokenPairMock = jest.fn();
const refreshAccessTokenMock = jest.fn();
const verifyTotpMock = jest.fn();
const setAdminSessionCookiesMock = jest.fn();
const revokeAdminCsrfTokensMock = jest.fn();
const consumeBackupCodeMock = jest.fn();
const generateBackupCodesInTransactionMock = jest.fn();

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
jest.mock('../src/middleware/ip-block.middleware', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (fn: unknown) => dbTransactionMock(fn),
  },
}));
jest.mock('../src/services/auth.service', () => ({
  verifyPasswordWithRehash: (...args: unknown[]) => verifyPasswordWithRehashMock(...args),
  createTokenPair: (...args: unknown[]) => createTokenPairMock(...args),
  refreshAccessToken: (...args: unknown[]) => refreshAccessTokenMock(...args),
}));
jest.mock('../src/services/security.service', () => ({
  recordLoginAttempt: jest.fn(async () => undefined),
  logSecurityEvent: jest.fn(async () => undefined),
}));
jest.mock('../src/services/admin-2fa.service', () => ({
  consumeBackupCode: (...args: unknown[]) => consumeBackupCodeMock(...args),
  generateBackupCodesInTransaction: (...args: unknown[]) => (
    generateBackupCodesInTransactionMock(...args)
  ),
}));
jest.mock('../src/utils/totp', () => ({
  generateTotpSecret: jest.fn(() => 'secret'),
  generateTotpUri: jest.fn(() => 'otpauth://test'),
  encryptSecret: jest.fn((value: string) => `encrypted:${value}`),
  decryptSecret: jest.fn(() => 'decrypted-secret'),
  verifyTotp: (...args: unknown[]) => verifyTotpMock(...args),
}));
jest.mock('../src/utils/admin-cookies', () => ({
  setAdminSessionCookies: (...args: unknown[]) => setAdminSessionCookiesMock(...args),
  clearAdminSessionCookies: jest.fn(),
  revokeAdminCsrfTokens: (...args: unknown[]) => revokeAdminCsrfTokensMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';

const USER_ID = '10000000-0000-4000-8000-000000000011';
const userFixture = {
  id: USER_ID,
  phone: '+639171234567',
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'Operator',
  role: 'admin',
  avatar_url: null,
  is_verified: true,
  is_active: true,
  session_version: 3,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  password_hash: 'stored-password-hash',
  must_rotate_password: true,
};

function expectCookieOnlySession(response: SupertestResponse): void {
  const serializedBody = JSON.stringify(response.body);
  expect(serializedBody).not.toContain('accessToken');
  expect(serializedBody).not.toContain('refreshToken');
  expect(serializedBody).not.toContain('access-secret-');
  expect(serializedBody).not.toContain('refresh-secret-');
  expect(response.body).toMatchObject({
    success: true,
    data: {
      user: { id: USER_ID, email: 'admin@example.com', role: 'admin' },
    },
  });
  expect(response.body.data.sessionExpiresAt).toEqual(expect.any(String));

  const cookies = response.headers['set-cookie'] as unknown as string[];
  expect(cookies).toEqual(expect.arrayContaining([
    expect.stringMatching(/^admin_session=.*; Path=\/; HttpOnly/),
    expect.stringMatching(/^admin_refresh=.*; Path=\/api\/v1\/auth\/admin\/refresh; HttpOnly/),
    expect.stringMatching(/^admin_csrf=csrf-test-token; Path=\//),
  ]));
}

it('CRIT-N11 - every completed admin authentication flow keeps bearer tokens out of response JSON', async () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  const previousDisable2fa = process.env.ADMIN_DISABLE_2FA;
  process.env.JWT_SECRET = 'crit-n11-test-secret';
  process.env.ADMIN_DISABLE_2FA = '1';

  setAdminSessionCookiesMock.mockImplementation(async (
    res: express.Response,
    input: { accessToken: string; refreshToken: string },
  ) => {
    res.cookie('admin_session', input.accessToken, { httpOnly: true, path: '/' });
    res.cookie('admin_refresh', input.refreshToken, {
      httpOnly: true,
      path: '/api/v1/auth/admin/refresh',
    });
    res.cookie('admin_csrf', 'csrf-test-token', { path: '/' });
    return { csrfToken: 'csrf-test-token' };
  });
  verifyPasswordWithRehashMock.mockReturnValue({ valid: true, needsRehash: false });
  verifyTotpMock.mockReturnValue(true);
  revokeAdminCsrfTokensMock.mockResolvedValue(undefined);
  dbTransactionMock.mockImplementation(async (
    fn: (client: { query: typeof dbQueryMock }) => Promise<unknown>,
  ) => fn({ query: dbQueryMock }));
  generateBackupCodesInTransactionMock.mockResolvedValue({
    codes: [
      'AAAAA22222',
      'BBBBB33333',
      'CCCCC44444',
      'DDDDD55555',
      'EEEEE66666',
      'FFFFF77777',
      'GGGGG88888',
      'HHHHH99999',
    ],
    generatedAt: new Date('2026-09-02T00:00:00.000Z'),
  });

  let scenario: 'login' | 'verify' | 'enable' | 'refresh' = 'login';
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (scenario === 'login') {
      if (sql.includes('COUNT(*)::text AS count')) return { rows: [{ count: '0' }], rowCount: 1 };
      if (sql.includes('password_hash')) return { rows: [userFixture], rowCount: 1 };
      if (sql.includes('SELECT totp_enabled')) return { rows: [{ totp_enabled: false }], rowCount: 1 };
      if (sql.includes('UPDATE users SET last_login_at')) return { rows: [], rowCount: 1 };
    }
    if (scenario === 'verify') {
      if (sql.includes('SELECT id, phone, totp_secret')) {
        return {
          rows: [{
            id: USER_ID,
            phone: userFixture.phone,
            totp_secret: 'encrypted-secret',
            totp_enabled: true,
            role: 'admin',
            session_version: 3,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('UPDATE users SET last_login_at')) return { rows: [], rowCount: 1 };
      if (sql.includes('COALESCE(must_rotate_password')) return { rows: [userFixture], rowCount: 1 };
    }
    if (scenario === 'enable') {
      if (sql.includes('SELECT role, is_active, session_version')) {
        return { rows: [{ role: 'admin', is_active: true, session_version: 3 }], rowCount: 1 };
      }
      if (sql.includes('FOR NO KEY UPDATE')) {
        return { rows: [{ ...userFixture, totp_secret: 'encrypted-secret', totp_enabled: false }], rowCount: 1 };
      }
      if (sql.includes('SET totp_enabled = TRUE')) return { rows: [], rowCount: 1 };
      if (sql.includes('COALESCE(must_rotate_password')) return { rows: [userFixture], rowCount: 1 };
      if (sql.includes('UPDATE users SET last_login_at')) return { rows: [], rowCount: 1 };
    }
    if (scenario === 'refresh') {
      if (sql.includes("role IN ('admin', 'super_admin', 'dpo')")) {
        return { rows: [userFixture], rowCount: 1 };
      }
    }
    throw new Error(`Unexpected ${scenario} query: ${sql}`);
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  try {
    createTokenPairMock.mockResolvedValueOnce({
      accessToken: 'access-secret-login', refreshToken: 'refresh-secret-login',
    });
    const login = await request(app).post('/auth/admin/login').send({
      email: 'admin@example.com', password: 'valid-password',
    });
    expect(login.status).toBe(200);
    expectCookieOnlySession(login);
    expect(login.body.data.mustRotatePassword).toBe(true);

    delete process.env.ADMIN_DISABLE_2FA;
    scenario = 'verify';
    createTokenPairMock.mockResolvedValueOnce({
      accessToken: 'access-secret-verify', refreshToken: 'refresh-secret-verify',
    });
    const preAuthToken = jwt.sign({
      userId: USER_ID,
      role: 'admin',
      sessionVersion: 3,
      type: 'pre_auth_2fa',
    }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const verified = await request(app).post('/auth/admin/2fa/verify').send({
      preAuthToken, totpCode: '123456',
    });
    expect(verified.status).toBe(200);
    expectCookieOnlySession(verified);
    expect(verified.body.data.mustRotatePassword).toBe(true);

    scenario = 'enable';
    createTokenPairMock.mockResolvedValueOnce({
      accessToken: 'access-secret-enable', refreshToken: 'refresh-secret-enable',
    });
    const setupToken = jwt.sign({
      userId: USER_ID,
      role: 'admin',
      sessionVersion: 3,
      type: 'pre_auth_2fa_setup',
    }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const enabled = await request(app)
      .post('/auth/admin/2fa/enable')
      .set('Authorization', `Bearer ${setupToken}`)
      .send({ totpCode: '123456' });
    expect(enabled.status).toBe(200);
    expectCookieOnlySession(enabled);
    expect(enabled.body.data.mustRotatePassword).toBe(true);

    scenario = 'refresh';
    const refreshedAccessToken = jwt.sign({
      userId: USER_ID,
      role: 'admin',
      sessionVersion: 3,
      type: 'access',
    }, process.env.JWT_SECRET, { expiresIn: '15m' });
    refreshAccessTokenMock.mockResolvedValueOnce({
      accessToken: refreshedAccessToken,
      refreshToken: 'refresh-secret-refresh',
    });
    const refreshed = await request(app)
      .post('/auth/admin/refresh')
      .set('Cookie', 'admin_refresh=incoming-refresh-cookie');
    expect(refreshed.status).toBe(200);
    expectCookieOnlySession(refreshed);

    expect(setAdminSessionCookiesMock).toHaveBeenCalledTimes(4);
    expect(revokeAdminCsrfTokensMock).toHaveBeenCalledWith(USER_ID);
  } finally {
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
    if (previousDisable2fa === undefined) delete process.env.ADMIN_DISABLE_2FA;
    else process.env.ADMIN_DISABLE_2FA = previousDisable2fa;
  }
});
