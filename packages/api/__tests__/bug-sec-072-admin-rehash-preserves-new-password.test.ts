import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import authRouter from '../src/routes/auth.routes';
import securityRouter from '../src/routes/security.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import * as auth from '../src/services/auth.service';
import { disconnectUserSockets } from '../src/services/socket.service';
import { passwordIntegrationIt as it, withPasswordDatabase, seedPasswordOwner,
  passwordOwner, passwordEmail, oldPassword, newPassword, originalHash,
  pauseLockedPasswordRead, within, waitForBlockedRehash } from './helpers/admin-password-postgres';

// Password verification, real HTTP guards, hashing, SQL, JWT/cookie issuance,
// revocation and password audit stay real. No external telemetry or sockets.
jest.mock('../src/services/security.service', () => ({
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/socket.service', () => ({ disconnectUserSockets: jest.fn() }));

it('Bug SEC-072 — an older login rehash waiting on password rotation cannot restore the old password or disturb replacement authority', async () => {
  const previous = { JWT_SECRET: process.env.JWT_SECRET, ADMIN_DISABLE_2FA: process.env.ADMIN_DISABLE_2FA };
  process.env.JWT_SECRET = 'synthetic-password-concurrency-test-not-a-live-secret';
  process.env.ADMIN_DISABLE_2FA = '0';
  const app = express(); app.use(express.json(), cookieParser());
  app.use('/api/v1/auth', authRouter); app.use('/api/v1/security', securityRouter); app.use(errorMiddleware);
  const login = (password: string) => request(app).post('/api/v1/auth/admin/login').send({ email: passwordEmail, password });
  try {
    for (const role of ['admin', 'super_admin', 'dpo']) {
      for (const format of ['legacy', 'weaker'] as const) {
        await withPasswordDatabase(async database => {
          expect((await database.query('SHOW transaction_isolation')).rows[0].transaction_isolation).toBe('read committed');
          const beforeHash = originalHash(format);
          await seedPasswordOwner(database, beforeHash, role);
          const oldTokens = await auth.createTokenPair(passwordOwner, role, 1);
          await database.query(`INSERT INTO admin_csrf_tokens (admin_user_id,token,expires_at)
            VALUES ($1,'synthetic-old-csrf',NOW()+INTERVAL '1 hour')`, [passwordOwner]);
          const pause = pauseLockedPasswordRead();
          let pendingLogin: Promise<request.Response> | undefined;
          const pendingRotation = request(app).post('/api/v1/security/admin/me/change-password')
            .set('Cookie', `admin_session=${oldTokens.accessToken}; admin_csrf=synthetic-old-csrf`)
            .set('X-CSRF-Token', 'synthetic-old-csrf')
            .send({ oldPassword, newPassword }).then(value => value);
          try {
            await within(pause.entered, 'actual password row lock');
            pendingLogin = login(oldPassword).then(value => value);
            await waitForBlockedRehash(database);
            expect((await database.query('SELECT password_hash,session_version FROM users')).rows)
              .toEqual([{ password_hash: beforeHash, session_version: 1 }]);
            pause.release();
            const changed = await pendingRotation, staleLogin = await pendingLogin;
            expect(changed.status).toBe(200);
            expect(changed.body.data).toMatchObject({ sessionVersion: 2, revokedRefreshSessions: 1 });
            expect(staleLogin.status).toBe(200);
            expect(staleLogin.body.data.requires2FA).toBe(true);
            expect(staleLogin.headers['set-cookie']).toBeUndefined();

            const saved = (await database.query('SELECT password_hash,session_version,must_rotate_password FROM users')).rows[0];
            expect(auth.verifyPassword(newPassword, saved.password_hash)).toBe(true);
            expect(auth.verifyPassword(oldPassword, saved.password_hash)).toBe(false);
            expect(saved).toMatchObject({ session_version: 2, must_rotate_password: false });
            const audits = (await database.query('SELECT admin_id,action_type,target_id,details FROM admin_actions')).rows;
            expect(audits).toEqual([{ admin_id: passwordOwner, action_type: 'admin_password_rotated', target_id: passwordOwner,
              details: { previousHashUpgraded: true, scryptN: auth.SCRYPT_N, sessionVersion: 2,
                revokedRefreshSessions: 1, revokedCsrfTokens: 1 } }]);
            expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 1 }]);
            expect((await database.query(`SELECT count(*)::int AS count FROM admin_csrf_tokens WHERE revoked_at IS NULL`)).rows)
              .toEqual([{ count: 1 }]);
            expect((await database.query(`SELECT revoked_at IS NOT NULL AS revoked FROM admin_csrf_tokens WHERE token='synthetic-old-csrf'`)).rows)
              .toEqual([{ revoked: true }]);
            expect(disconnectUserSockets).toHaveBeenCalledWith(passwordOwner);

            const cookies = (changed.headers['set-cookie'] as unknown as string[]).map(cookie => cookie.split(';')[0]!).join('; ');
            const current = await request(app).get('/api/v1/auth/me').set('Cookie', cookies);
            expect(current.status).toBe(200);
            expect(current.body.data).toMatchObject({ id: passwordOwner, role, mustRotatePassword: false });
            expect((await request(app).get('/api/v1/auth/me').auth(oldTokens.accessToken, { type: 'bearer' })).status).toBe(401);
            expect((await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: oldTokens.refreshToken })).status).toBe(401);
            const staleFactor = await request(app).post('/api/v1/auth/admin/2fa/verify')
              .send({ preAuthToken: staleLogin.body.data.preAuthToken, totpCode: '123456' });
            expect(staleFactor.status).toBe(401);
            expect(staleFactor.body.error.message).toContain('revoked');
            expect((await login(oldPassword)).status).toBe(401);
            const freshLogin = await login(newPassword);
            expect(freshLogin.status).toBe(200);
            expect(jwt.verify(freshLogin.body.data.preAuthToken, process.env.JWT_SECRET!))
              .toMatchObject({ userId: passwordOwner, role, sessionVersion: 2, type: 'pre_auth_2fa' });
            expect((await database.query('SELECT password_hash,session_version,must_rotate_password FROM users')).rows).toEqual([saved]);
            expect((await database.query('SELECT admin_id,action_type,target_id,details FROM admin_actions')).rows).toEqual(audits);
          } finally {
            pause.release(); await Promise.allSettled([pendingRotation, pendingLogin]); pause.restore();
          }
        });
      }
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}, 60000);
