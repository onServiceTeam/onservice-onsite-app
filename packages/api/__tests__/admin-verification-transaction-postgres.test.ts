import jwt from 'jsonwebtoken';
import request from 'supertest';
import { enrollmentApp } from './helpers/admin-enrollment-postgres';
import {
  verificationIt as it, verificationOwner, requestVerification, withVerificationDatabase,
  waitForVerificationLock, within,
} from './helpers/admin-verification-postgres';
import { generateTotp, generateTotpSecret, verifyTotp, encryptSecret } from '../src/utils/totp';
import { db } from '../src/models/db';
import { deferred } from './helpers/admin-password-postgres';
import type { Pool, QueryResultRow } from 'pg';

async function verificationState(database: Pool): Promise<Record<string, QueryResultRow[]>> {
  const result: Record<string, QueryResultRow[]> = {};
  for (const table of ['users', 'admin_actions', 'admin_backup_codes', 'refresh_tokens', 'admin_csrf_tokens']) {
    result[table] = (await database.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return result;
}

it('second-factor login keeps normal TOTP sign-in, current role and cookie-only credentials for all privileged roles', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    await withVerificationDatabase(async (database, secret) => {
      await database.query('UPDATE users SET must_rotate_password=TRUE WHERE id=$1', [verificationOwner]);
      const response = await requestVerification({ totpCode: generateTotp(secret) }, role);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ user: { id: verificationOwner, role }, mustRotatePassword: true });
      expect(response.body.data).not.toHaveProperty('backupCodesRemaining');
      expect(response.body.data).not.toHaveProperty('accessToken');
      expect(response.body.data).not.toHaveProperty('refreshToken');
      expect(JSON.stringify(response.body)).not.toContain(secret);
      const cookieHeader: unknown = response.headers['set-cookie'];
      expect(Array.isArray(cookieHeader)).toBe(true);
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader.filter((value): value is string => typeof value === 'string') : [];
      expect(cookies).toEqual(expect.arrayContaining([
        expect.stringMatching(/^admin_session=.*; HttpOnly/),
        expect.stringMatching(/^admin_refresh=.*; HttpOnly/),
        expect.stringMatching(/^admin_csrf=/),
      ]));
      const access = cookies.find(value => value.startsWith('admin_session='))!.split(';')[0]!.slice('admin_session='.length);
      expect(jwt.verify(access, process.env.JWT_SECRET!))
        .toMatchObject({ userId: verificationOwner, role, sessionVersion: 1 });
      const identified = await request(enrollmentApp).get('/auth/me').auth(access, { type: 'bearer' });
      expect(identified.status).toBe(200);
      expect(identified.body.data).toMatchObject({ id: verificationOwner, role, mustRotatePassword: true });
      expect((await database.query('SELECT last_login_at FROM users')).rows[0])
        .toEqual({ last_login_at: expect.any(Date) });
      expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 1 }]);
      expect((await database.query('SELECT count(*)::int AS count FROM admin_csrf_tokens')).rows).toEqual([{ count: 1 }]);
      expect((await database.query('SELECT count(*)::int AS count FROM admin_backup_codes WHERE used_at IS NULL')).rows)
        .toEqual([{ count: 8 }]);
    }, role);
  }
}, 30000);

it('a recovery-consumption audit failure rolls back the entire verification and permits the same code on retry', async () => {
  await withVerificationDatabase(async (database, _secret, codes) => {
    const before = await verificationState(database);
    await database.query(`CREATE FUNCTION fail_verification_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic verification audit failure'; END $$;
      CREATE TRIGGER fail_verification_audit BEFORE INSERT ON admin_actions
        FOR EACH ROW EXECUTE FUNCTION fail_verification_audit();`);
    const failed = await requestVerification({ backupCode: codes[0]! });
    expect(failed.status).toBe(500);
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect(failed.body.data).toBeUndefined();
    expect(await verificationState(database)).toEqual(before);
    await database.query('DROP TRIGGER fail_verification_audit ON admin_actions');
    const retry = await requestVerification({ backupCode: codes[0]! });
    expect(retry.status).toBe(200);
    expect(retry.body.data.backupCodesRemaining).toBe(7);
    expect((await database.query("SELECT count(*)::int AS count FROM admin_actions WHERE action_type='admin_backup_code_used'")).rows)
      .toEqual([{ count: 1 }]);
    expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 1 }]);
  });
}, 30000);

it('a rolled-back account revocation permits the waiting verification with the original authority', async () => {
  await withVerificationDatabase(async (database, _secret, codes) => {
    const writer = await database.connect();
    let pending: Promise<import('supertest').Response> | undefined;
    try {
      await writer.query('BEGIN');
      const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await writer.query('UPDATE users SET session_version=2 WHERE id=$1', [verificationOwner]);
      pending = requestVerification({ backupCode: codes[0]! }).then(response => response);
      await waitForVerificationLock(database, pid);
      await writer.query('ROLLBACK');
      const response = await within(pending, 'verification after rolled-back revocation');
      expect(response.status).toBe(200);
      expect(response.body.data.backupCodesRemaining).toBe(7);
      expect((await database.query('SELECT session_version FROM users')).rows).toEqual([{ session_version: 1 }]);
      expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 1 }]);
    } finally {
      await writer.query('ROLLBACK'); writer.release();
      if (pending) await pending;
    }
  });
}, 30000);

it('revocation after verification commits denies session issuance without pretending committed recovery use was rolled back', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    await withVerificationDatabase(async (database, _secret, codes) => {
      const actual = db.transaction, entered = deferred(), release = deferred();
      let paused = false;
      db.transaction = async work => {
        const result = await actual(work);
        if (!paused) { paused = true; entered.resolve(); await release.promise; }
        return result;
      };
      const pending = requestVerification({ backupCode: codes[0]! }, role).then(response => response);
      try {
        await within(entered.promise, 'committed verification');
        await database.query('UPDATE users SET session_version=2 WHERE id=$1', [verificationOwner]);
        const committed = await verificationState(database);
        expect(committed.users![0]!.last_login_at).toEqual(expect.any(Date));
        expect(committed.admin_backup_codes!.filter(row => row.used_at !== null)).toHaveLength(1);
        expect(committed.admin_actions!.filter(row => row.action_type === 'admin_backup_code_used')).toHaveLength(1);
        release.resolve();
        const response = await within(pending, 'revoked session issuance');
        expect(response.status).toBe(401);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.body.data).toBeUndefined();
        expect(await verificationState(database)).toEqual(committed);
        expect(committed.refresh_tokens).toEqual([]);
        expect(committed.admin_csrf_tokens).toEqual([]);
      } finally {
        release.resolve(); await pending; db.transaction = actual;
      }
    }, role);
  }
}, 30000);

it('two concurrent uses of the same recovery code issue exactly one cookie session and one consumption audit', async () => {
  await withVerificationDatabase(async (database, _secret, codes) => {
    const responses = await Promise.all([
      requestVerification({ backupCode: codes[0]! }), requestVerification({ backupCode: codes[0]! }),
    ]);
    expect(responses.map(value => value.status).sort()).toEqual([200, 401]);
    expect(responses.find(value => value.status === 200)!.body.data.backupCodesRemaining).toBe(7);
    expect(responses.find(value => value.status === 401)!.headers['set-cookie']).toBeUndefined();
    expect((await database.query('SELECT count(*)::int AS count FROM admin_backup_codes WHERE used_at IS NOT NULL')).rows)
      .toEqual([{ count: 1 }]);
    expect((await database.query("SELECT count(*)::int AS count FROM admin_actions WHERE action_type='admin_backup_code_used'")).rows)
      .toEqual([{ count: 1 }]);
    expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 1 }]);
    expect((await database.query('SELECT count(*)::int AS count FROM admin_csrf_tokens')).rows).toEqual([{ count: 1 }]);
  });
}, 30000);

it('a waiting verification reads the committed factor and does not accept the previous authenticator code', async () => {
  await withVerificationDatabase(async (database, oldSecret) => {
    const oldCode = generateTotp(oldSecret);
    let replacement = generateTotpSecret();
    for (let attempt = 0; attempt < 5 && verifyTotp(replacement, oldCode, 2); attempt++) replacement = generateTotpSecret();
    expect(verifyTotp(replacement, oldCode, 2)).toBe(false);
    const blocker = await database.connect();
    let pending: Promise<import('supertest').Response> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      // Synthetic concurrent factor writer, not a newly enabled recovery API.
      await blocker.query('UPDATE users SET totp_secret=$2 WHERE id=$1', [verificationOwner, encryptSecret(replacement)]);
      const accounts = (await blocker.query('SELECT * FROM users')).rows;
      const codes = (await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows;
      pending = requestVerification({ totpCode: oldCode }).then(value => value);
      await waitForVerificationLock(database, pid);
      await blocker.query('COMMIT');
      const response = await within(pending, 'replaced factor response');
      expect(response.status).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
      expect((await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows).toEqual(codes);
      expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
      expect((await database.query('SELECT * FROM admin_csrf_tokens')).rows).toEqual([]);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (pending) await pending;
    }
  });
}, 30000);

it('unconfigured factors refuse even a valid recovery code without recording a login or consuming it', async () => {
  for (const mutation of ['disabled', 'missing']) {
    await withVerificationDatabase(async (database, _secret, codes) => {
      await database.query(mutation === 'disabled'
        ? 'UPDATE users SET totp_enabled=FALSE WHERE id=$1'
        : 'UPDATE users SET totp_secret=NULL WHERE id=$1', [verificationOwner]);
      const accounts = (await database.query('SELECT * FROM users')).rows;
      const before = (await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows;
      const response = await requestVerification({ backupCode: codes[0]! });
      expect(response.status).toBe(400);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
      expect((await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows).toEqual(before);
      expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
      expect((await database.query('SELECT * FROM admin_csrf_tokens')).rows).toEqual([]);
    });
  }
}, 30000);
