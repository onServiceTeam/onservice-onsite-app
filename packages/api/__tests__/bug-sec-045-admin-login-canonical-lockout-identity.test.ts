import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const verifyPasswordWithRehashMock = jest.fn();
const recordLoginAttemptMock = jest.fn();
const logSecurityEventMock = jest.fn();

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
  createTokenPair: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

jest.mock('../src/services/security.service', () => ({
  recordLoginAttempt: (...args: unknown[]) => recordLoginAttemptMock(...args),
  logSecurityEvent: (...args: unknown[]) => logSecurityEventMock(...args),
}));

jest.mock('../src/services/admin-2fa.service', () => ({
  consumeBackupCode: jest.fn(),
  generateBackupCodesInTransaction: jest.fn(),
}));

jest.mock('../src/utils/totp', () => ({
  generateTotpSecret: jest.fn(),
  generateTotpUri: jest.fn(),
  encryptSecret: jest.fn(),
  decryptSecret: jest.fn(),
  verifyTotp: jest.fn(),
}));

jest.mock('../src/utils/admin-cookies', () => ({
  setAdminSessionCookies: jest.fn(),
  clearAdminSessionCookies: jest.fn(),
  revokeAdminCsrfTokens: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import authRouter from '../src/routes/auth.routes';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  verifyPasswordWithRehashMock.mockReset();
  recordLoginAttemptMock.mockReset().mockResolvedValue(undefined);
  logSecurityEventMock.mockReset().mockResolvedValue(undefined);
});

it('SEC-045 - canonicalizes Admin email for lockout lookup and failed-attempt evidence', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: '10000000-0000-4000-8000-000000000045',
        phone: '+639171234567',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'Operator',
        role: 'admin',
        avatar_url: null,
        is_verified: true,
        is_active: true,
        session_version: 1,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        password_hash: 'stored-password-hash',
        must_rotate_password: false,
      }],
      rowCount: 1,
    });
  verifyPasswordWithRehashMock.mockReturnValue({ valid: false, needsRehash: false });

  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use((
    error: { statusCode?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

  const response = await request(app).post('/auth/admin/login').send({
    email: 'Admin@Example.COM',
    password: 'wrong-password',
  });

  expect(response.status).toBe(401);
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual(['admin@example.com']);
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(['admin@example.com']);
  expect(recordLoginAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
    phone: 'admin@example.com',
    attemptType: 'admin_login',
    success: false,
  }));
  expect(logSecurityEventMock).toHaveBeenCalledWith(expect.objectContaining({
    metadata: { email: 'admin@example.com', reason: 'invalid_password' },
  }));
});
