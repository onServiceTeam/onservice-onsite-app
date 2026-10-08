import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool, QueryResultRow } from 'pg';

jest.mock('express-rate-limit', () => ({ __esModule: true, default: jest.fn(() => (
  _req: express.Request, _res: express.Response, next: express.NextFunction,
) => next()) }));
jest.mock('rate-limit-redis', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../src/config/redis.config', () => ({ redis: { call: jest.fn(), status: 'ready' } }));
jest.mock('../../src/services/security.service', () => ({ recordLoginAttempt: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import authRouter from '../../src/routes/auth.routes';
import { db } from '../../src/models/db';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { generateTotpSecret, encryptSecret } from '../../src/utils/totp';
import { passwordOwner, withPasswordDatabase, deferred } from './admin-password-postgres';
export { passwordOwner as enrollmentOwner, passwordIntegrationIt as enrollmentIt, within } from './admin-password-postgres';

const secret = 'synthetic-enrollment-session-secret';
export const enrollmentApp = express();
enrollmentApp.use(express.json());
enrollmentApp.use('/auth', authRouter);
enrollmentApp.use(errorMiddleware);

export function enrollmentToken(role: string, type = 'pre_auth_2fa_setup', owner = passwordOwner): string {
  return jwt.sign({ userId: owner, role, sessionVersion: 1, type }, secret,
    { algorithm: 'HS256', expiresIn: 300 });
}

export function requestSetup(role = 'admin', type = 'pre_auth_2fa_setup', owner = passwordOwner) {
  return request(enrollmentApp).post('/auth/admin/2fa/setup')
    .set('Authorization', `Bearer ${enrollmentToken(role, type, owner)}`).send({});
}

export async function withEnrollmentDatabase(
  run: (database: Pool, totpSecret: string) => Promise<void>, role = 'admin',
): Promise<void> {
  const previous = { jwt: process.env.JWT_SECRET, encryption: process.env.TOTP_ENCRYPTION_KEY };
  process.env.JWT_SECRET = secret;
  process.env.TOTP_ENCRYPTION_KEY = 'b7'.repeat(32);
  try {
    await withPasswordDatabase(async database => {
      const totpSecret = generateTotpSecret();
      await database.query(`CREATE TABLE admin_backup_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash text NOT NULL, used_at timestamptz, used_ip inet,
        created_at timestamptz NOT NULL DEFAULT NOW(), deleted_at timestamptz,
        deleted_by uuid REFERENCES users(id) ON DELETE SET NULL);
      `);
      await database.query(`INSERT INTO users (id,role,email,totp_enabled,totp_secret,must_rotate_password)
        VALUES ($1,$2,'synthetic-enrollment@example.invalid',FALSE,$3,FALSE)`,
      [passwordOwner, role, encryptSecret(totpSecret)]);
      await run(database, totpSecret);
    });
  } finally {
    if (previous.jwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous.jwt;
    if (previous.encryption === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = previous.encryption;
  }
}

// Scheduling hooks only. Every query, transaction and cryptographic operation
// still runs. No account state or query result is fabricated by these pauses.
export function pauseEnrollmentAuthorization() {
  const actual = db.query, entered = deferred(), release = deferred();
  let paused = false;
  db.query = async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
    const result = await actual<R>(sql, params);
    if (!paused && sql.includes('SELECT role, is_active, session_version')) {
      paused = true; entered.resolve(); await release.promise;
    }
    return result;
  };
  return { entered: entered.promise, release: release.resolve, restore: () => { db.query = actual; } };
}

export function pauseFirstEnrollmentTransaction() {
  const actual = db.transaction, entered = deferred(), release = deferred();
  let paused = false;
  db.transaction = async work => {
    if (!paused) { paused = true; entered.resolve(); await release.promise; }
    return actual(work);
  };
  return { entered: entered.promise, release: release.resolve, restore: () => { db.transaction = actual; } };
}
