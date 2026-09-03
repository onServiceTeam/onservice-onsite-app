import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const dbQueryMock = jest.fn();
const consumeBackupCodeMock = jest.fn();
const createTokenPairMock = jest.fn();
const verifyTotpMock = jest.fn();
const setAdminSessionCookiesMock = jest.fn();

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
  getClientIp: jest.fn(() => '203.0.113.38'),
}));
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/auth.service', () => ({
  createTokenPair: (...args: unknown[]) => createTokenPairMock(...args),
}));
jest.mock('../src/services/admin-2fa.service', () => ({
  consumeBackupCode: (...args: unknown[]) => consumeBackupCodeMock(...args),
  generateBackupCodesInTransaction: jest.fn(),
}));
jest.mock('../src/services/security.service', () => ({
  recordLoginAttempt: jest.fn(async () => undefined),
  logSecurityEvent: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/totp', () => ({
  decryptSecret: jest.fn(() => 'decrypted-secret'),
  verifyTotp: (...args: unknown[]) => verifyTotpMock(...args),
  generateTotpSecret: jest.fn(),
  generateTotpUri: jest.fn(),
  encryptSecret: jest.fn(),
}));
jest.mock('../src/utils/admin-cookies', () => ({
  setAdminSessionCookies: (...args: unknown[]) => setAdminSessionCookiesMock(...args),
  clearAdminSessionCookies: jest.fn(),
  revokeAdminCsrfTokens: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug SEC-038 — admin login consumes one recovery code and reports the remaining count', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'sec-038-backup-code-login-secret';
  const userId = '10000000-0000-4000-8000-000000000038';
  const user = {
    id: userId,
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
    totp_secret: 'encrypted-secret',
    totp_enabled: true,
    must_rotate_password: false,
  };
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, phone, totp_secret')) {
      return { rows: [user], rowCount: 1 };
    }
    if (sql.includes('UPDATE users SET last_login_at')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('COALESCE(must_rotate_password')) {
      return { rows: [user], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  consumeBackupCodeMock.mockResolvedValue({ remainingCodes: 7 });
  createTokenPairMock.mockResolvedValue({
    accessToken: 'cookie-only-access',
    refreshToken: 'cookie-only-refresh',
  });
  setAdminSessionCookiesMock.mockResolvedValue({ csrfToken: 'csrf-token' });

  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorMiddleware);
  const preAuthToken = jwt.sign({
    userId,
    role: 'admin',
    sessionVersion: 3,
    type: 'pre_auth_2fa',
  }, process.env.JWT_SECRET, { expiresIn: '10m' });

  try {
    const ambiguous = await request(app).post('/auth/admin/2fa/verify').send({
      preAuthToken,
      totpCode: '123456',
      backupCode: 'ABCD234567',
    });
    expect(ambiguous.status).toBe(400);
    expect(consumeBackupCodeMock).not.toHaveBeenCalled();

    const response = await request(app).post('/auth/admin/2fa/verify').send({
      preAuthToken,
      backupCode: 'ABCD234567',
    });
    expect(response.status).toBe(200);
    expect(consumeBackupCodeMock).toHaveBeenCalledWith(
      userId,
      'ABCD234567',
      '203.0.113.38',
    );
    expect(verifyTotpMock).not.toHaveBeenCalled();
    expect(response.body.data.backupCodesRemaining).toBe(7);
    expect(JSON.stringify(response.body)).not.toContain('cookie-only-access');
    expect(JSON.stringify(response.body)).not.toContain('cookie-only-refresh');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
