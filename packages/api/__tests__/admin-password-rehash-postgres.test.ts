import express from 'express';
import request from 'supertest';
import type { QueryResultRow } from 'pg';
import authRouter from '../src/routes/auth.routes';
import securityRouter from '../src/routes/security.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { db } from '../src/models/db';
import * as auth from '../src/services/auth.service';
import { disconnectUserSockets } from '../src/services/socket.service';
import { passwordIntegrationIt as it, withPasswordDatabase, seedPasswordOwner,
  passwordOwner, passwordEmail, oldPassword, newPassword, originalHash,
  deferred, within, pauseLockedPasswordRead, waitForBlockedRehash } from './helpers/admin-password-postgres';

jest.mock('../src/services/security.service', () => ({
  recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/socket.service', () => ({ disconnectUserSockets: jest.fn() }));

const previous = { JWT_SECRET: process.env.JWT_SECRET, ADMIN_DISABLE_2FA: process.env.ADMIN_DISABLE_2FA };
beforeEach(() => {
  process.env.JWT_SECRET = 'synthetic-rehash-support-tests-not-a-live-secret';
  process.env.ADMIN_DISABLE_2FA = '0';
  jest.mocked(disconnectUserSockets).mockClear();
});
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const app = express(); app.use(express.json());
app.use('/api/v1/auth', authRouter); app.use('/api/v1/security', securityRouter); app.use(errorMiddleware);
const login = (password = oldPassword) => request(app).post('/api/v1/auth/admin/login').send({ email: passwordEmail, password });

it('ordinary legacy and weaker-hash upgrades still preserve required rotation and the appropriate second-factor step', async () => {
  for (const format of ['legacy', 'weaker'] as const) {
    for (const enrolled of [true, false]) {
      await withPasswordDatabase(async database => {
        await seedPasswordOwner(database, originalHash(format));
        await database.query('UPDATE users SET totp_enabled=$1 WHERE id=$2', [enrolled, passwordOwner]);
        const before = (await database.query('SELECT * FROM users')).rows[0];
        const result = await login();
        expect(result.status).toBe(200);
        expect(result.body.data[enrolled ? 'requires2FA' : 'requires2FASetup']).toBe(true);
        expect(result.headers['set-cookie']).toBeUndefined();
        const after = (await database.query('SELECT * FROM users')).rows[0];
        expect(after.password_hash).not.toBe(before.password_hash);
        expect(auth.verifyPasswordWithRehash(oldPassword, after.password_hash)).toEqual({ valid: true, needsRehash: false });
        expect({ ...after, password_hash: before.password_hash }).toEqual(before);
        for (const table of ['admin_actions', 'refresh_tokens', 'admin_csrf_tokens']) {
          expect((await database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows).toEqual([{ count: 0 }]);
        }
      });
    }
  }
}, 30000);

it('incorrect passwords and current-format passwords do not rewrite the stored credential', async () => {
  await withPasswordDatabase(async database => {
    for (const hash of [originalHash(), auth.hashPassword(oldPassword)]) {
      await database.query('DELETE FROM users');
      await seedPasswordOwner(database, hash);
      const before = (await database.query('SELECT * FROM users')).rows;
      expect((await login('synthetic-wrong-password-9999')).status).toBe(401);
      expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
      if (!auth.verifyPasswordWithRehash(oldPassword, hash).needsRehash) {
        const result = await login();
        expect(result.status).toBe(200); expect(result.body.data.requires2FA).toBe(true);
        expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
      }
    }
  });
}, 30000);

it('two old-hash login attempts preserve the first completed upgrade and both keep second-factor requirements', async () => {
  await withPasswordDatabase(async database => {
    await seedPasswordOwner(database, originalHash());
    const actual = db.query, bothEntered = deferred(), first = deferred(), second = deferred();
    let attempts = 0;
    const affected: number[] = [];
    // Scheduling interception only. Both UPDATE statements execute unchanged
    // in PostgreSQL; its affected rows and final password are asserted below.
    db.query = async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
      if (sql.startsWith('UPDATE users SET password_hash')) {
        const attempt = ++attempts;
        if (attempt === 2) bothEntered.resolve();
        await (attempt === 1 ? first.promise : second.promise);
        const result = await actual<R>(sql, params); affected.push(result.rowCount ?? 0); return result;
      }
      return actual<R>(sql, params);
    };
    const pending = [login().then(value => value), login().then(value => value)];
    try {
      await within(bothEntered.promise, 'both real rehash attempts');
      first.resolve(); await within(Promise.race(pending), 'first upgrade response');
      const firstStored = (await database.query('SELECT * FROM users')).rows;
      second.resolve();
      for (const result of await Promise.all(pending)) {
        expect(result.status).toBe(200); expect(result.body.data.requires2FA).toBe(true);
        expect(result.headers['set-cookie']).toBeUndefined();
      }
      expect(attempts).toBe(2); expect(affected).toEqual([1, 0]);
      expect((await database.query('SELECT * FROM users')).rows).toEqual(firstStored);
      expect(auth.verifyPasswordWithRehash(oldPassword, firstStored[0].password_hash)).toEqual({ valid: true, needsRehash: false });
      expect(firstStored[0]).toMatchObject({ session_version: 1, must_rotate_password: true });
    } finally { first.resolve(); second.resolve(); await Promise.allSettled(pending); db.query = actual; }
  });
}, 30000);

it('an actual database upgrade failure keeps the original password and does not bypass second factor', async () => {
  await withPasswordDatabase(async database => {
    await seedPasswordOwner(database, originalHash());
    const before = (await database.query('SELECT * FROM users')).rows;
    await database.query(`CREATE FUNCTION reject_password_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic password upgrade failure'; END $$;
      CREATE TRIGGER reject_password_upgrade BEFORE UPDATE OF password_hash ON users
        FOR EACH ROW EXECUTE FUNCTION reject_password_upgrade();`);
    const result = await login();
    expect(result.status).toBe(200); expect(result.body.data.requires2FA).toBe(true);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
    expect(auth.verifyPassword(oldPassword, before[0].password_hash)).toBe(true);
  });
}, 30000);

it('rollback of a failed password replacement preserves prior authority and still permits the waiting legitimate hash upgrade', async () => {
  await withPasswordDatabase(async database => {
    await seedPasswordOwner(database, originalHash());
    const tokens = await auth.createTokenPair(passwordOwner, 'admin', 1);
    await database.query(`INSERT INTO admin_csrf_tokens (admin_user_id,token,expires_at)
      VALUES ($1,'synthetic-retained-csrf',NOW()+INTERVAL '1 hour')`, [passwordOwner]);
    const refreshBefore = (await database.query('SELECT * FROM refresh_tokens')).rows;
    const csrfBefore = (await database.query('SELECT * FROM admin_csrf_tokens')).rows;
    await database.query(`CREATE FUNCTION reject_password_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic password audit failure'; END $$;
      CREATE TRIGGER reject_password_audit BEFORE INSERT ON admin_actions
        FOR EACH ROW EXECUTE FUNCTION reject_password_audit();`);
    const pause = pauseLockedPasswordRead();
    let pendingLogin: Promise<request.Response> | undefined;
    const pendingRotation = request(app).post('/api/v1/security/admin/me/change-password')
      .auth(tokens.accessToken, { type: 'bearer' }).send({ oldPassword, newPassword }).then(value => value);
    try {
      await within(pause.entered, 'password lock before audit rollback');
      pendingLogin = login().then(value => value); await waitForBlockedRehash(database);
      pause.release();
      const changed = await pendingRotation, continued = await pendingLogin;
      expect(changed.status).toBe(500); expect(changed.headers['set-cookie']).toBeUndefined();
      expect(continued.status).toBe(200); expect(continued.body.data.requires2FA).toBe(true);
      const saved = (await database.query('SELECT password_hash,session_version,must_rotate_password FROM users')).rows[0];
      expect(auth.verifyPasswordWithRehash(oldPassword, saved.password_hash)).toEqual({ valid: true, needsRehash: false });
      expect(auth.verifyPassword(newPassword, saved.password_hash)).toBe(false);
      expect(saved).toMatchObject({ session_version: 1, must_rotate_password: true });
      expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(refreshBefore);
      expect((await database.query('SELECT * FROM admin_csrf_tokens')).rows).toEqual(csrfBefore);
      expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows).toEqual([{ count: 0 }]);
      expect(disconnectUserSockets).not.toHaveBeenCalled();
      expect((await request(app).get('/api/v1/auth/me').auth(tokens.accessToken, { type: 'bearer' })).status).toBe(200);
    } finally { pause.release(); await Promise.allSettled([pendingRotation, pendingLogin]); pause.restore(); }
  });
}, 30000);
