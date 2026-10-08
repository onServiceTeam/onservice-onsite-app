import {
  enrollmentIt as it, enrollmentOwner, requestEnable, requestSetup,
  withEnrollmentDatabase, pauseEnrollmentAuthorization, within,
} from './helpers/admin-enrollment-postgres';
import type { Pool, QueryResultRow } from 'pg';
import jwt from 'jsonwebtoken';
import { db } from '../src/models/db';
import { generateTotp, encryptSecret } from '../src/utils/totp';
import { consumeBackupCode } from '../src/services/admin-2fa.service';
import { deferred } from './helpers/admin-password-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';

async function state(database: Pool) {
  const result: Record<string, QueryResultRow[]> = {};
  for (const table of ['users', 'admin_actions', 'admin_backup_codes', 'refresh_tokens', 'admin_csrf_tokens']) {
    result[table] = (await database.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  return result;
}

it('eligible enrollment activates the verified key and issues one usable recovery set with cookie-only setup sessions', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const type of ['pre_auth_2fa_setup', 'access']) {
      await withEnrollmentDatabase(async (database, secret) => {
        const forced = type === 'pre_auth_2fa_setup';
        if (forced) await database.query('UPDATE users SET must_rotate_password=TRUE WHERE id=$1', [enrollmentOwner]);
        const before = (await database.query('SELECT * FROM users')).rows[0];
        const response = await requestEnable(generateTotp(secret), role, type);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('no-store');
        const codes = response.body.data.backupCodes as string[];
        expect(codes).toHaveLength(8);
        expect(new Set(codes).size).toBe(8);
        const after = await state(database);
        const owner = after.users![0]!;
        expect({ ...owner, totp_enabled: before.totp_enabled, updated_at: before.updated_at,
          last_login_at: before.last_login_at }).toEqual(before);
        expect(owner.totp_enabled).toBe(true);
        expect(owner.last_login_at === null).toBe(!forced);
        expect(after.admin_backup_codes).toHaveLength(8);
        expect(after.admin_backup_codes!.every(row => row.code_hash.startsWith('scrypt:')
          && !codes.includes(row.code_hash))).toBe(true);
        expect(after.admin_actions!.map(row => row.action_type)).toEqual(['admin_backup_codes_generated']);
        expect(after.refresh_tokens).toHaveLength(forced ? 1 : 0);
        expect(after.admin_csrf_tokens).toHaveLength(forced ? 1 : 0);
        expect(response.body.data.accessToken).toBeUndefined();
        expect(response.body.data.refreshToken).toBeUndefined();
        if (forced) {
          expect(response.body.data.mustRotatePassword).toBe(true);
          expect(response.body.data.user.role).toBe(role);
          const cookieHeader: unknown = response.headers['set-cookie'];
          expect(Array.isArray(cookieHeader)).toBe(true);
          const cookies = Array.isArray(cookieHeader)
            ? cookieHeader.filter((value): value is string => typeof value === 'string') : [];
          const access = cookies.find(cookie => cookie.startsWith('admin_session='))!;
          expect(access.includes('HttpOnly')).toBe(true);
          const credential = decodeURIComponent(access.split(';')[0]!.slice('admin_session='.length));
          const payload = jwt.verify(credential, process.env.JWT_SECRET!) as jwt.JwtPayload;
          expect({ userId: payload.userId, role: payload.role, sessionVersion: payload.sessionVersion })
            .toEqual({ userId: enrollmentOwner, role, sessionVersion: 1 });
        } else expect(response.headers['set-cookie']).toBeUndefined();
        expect(await consumeBackupCode(enrollmentOwner, codes[0]!, '127.0.0.1')).toEqual({ remainingCodes: 7 });
      }, role);
    }
  }
}, 60000);

it('activation waits for account-writer commit or rollback before accepting the earlier proof', async () => {
  for (const outcome of ['COMMIT', 'ROLLBACK']) {
    await withEnrollmentDatabase(async (database, secret) => {
      const pause = pauseEnrollmentAuthorization();
      const pending = requestEnable(generateTotp(secret)).then(response => response);
      const writer = await database.connect();
      try {
        await within(pause.entered, 'enable authorization');
        await writer.query('BEGIN');
        const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
        await writer.query('UPDATE users SET session_version=2 WHERE id=$1', [enrollmentOwner]);
        pause.release();
        await waitForBlockedApproval(database, pid);
        await writer.query(outcome);
        const response = await within(pending, 'enable after writer');
        expect(response.status).toBe(outcome === 'COMMIT' ? 401 : 200);
        const after = await state(database);
        expect(after.users![0]!.totp_enabled).toBe(outcome === 'ROLLBACK');
        expect(after.admin_backup_codes).toHaveLength(outcome === 'COMMIT' ? 0 : 8);
        expect(after.refresh_tokens).toHaveLength(outcome === 'COMMIT' ? 0 : 1);
      } finally {
        await writer.query('ROLLBACK'); writer.release();
        pause.release(); await pending; pause.restore();
      }
    });
  }
});

it('activation holding the account lock defeats competing setup or enable while another account can enroll', async () => {
  for (const competitor of ['setup', 'enable']) {
    await withEnrollmentDatabase(async (database, secret) => {
      const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      await database.query(`INSERT INTO users (id,role,email,totp_secret,totp_enabled,must_rotate_password)
        VALUES ($1,'dpo','synthetic-other@example.invalid',$2,FALSE,FALSE)`, [other, encryptSecret(secret)]);
      const actual = db.transaction, entered = deferred(), release = deferred();
      let paused = false, pid = 0;
      db.transaction = async work => actual(async client => work({
        query: async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
          const result = await client.query<R>(sql, params);
          if (!paused && sql.includes('FOR NO KEY UPDATE') && params?.[0] === enrollmentOwner) {
            paused = true;
            pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
            entered.resolve(); await release.promise;
          }
          return result;
        },
      }));
      const first = requestEnable(generateTotp(secret)).then(response => response);
      let second: Promise<{ status: number }> | undefined;
      try {
        await within(entered.promise, 'locked activation');
        second = (competitor === 'setup' ? requestSetup() : requestEnable(generateTotp(secret)))
          .then(response => response);
        await waitForBlockedApproval(database, pid);
        expect((await requestEnable(generateTotp(secret), 'dpo', 'access', other)).status).toBe(200);
        release.resolve();
        expect((await within(first, 'first activation')).status).toBe(200);
        expect((await within(second, 'competing request')).status).toBe(409);
        const after = await state(database);
        expect(after.users!.every(row => row.totp_enabled)).toBe(true);
        expect(after.admin_backup_codes).toHaveLength(16);
        expect(after.admin_actions).toHaveLength(2);
        expect(after.refresh_tokens).toHaveLength(1);
      } finally {
        release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]);
        db.transaction = actual;
      }
    });
  }
}, 60000);

it('revocation after committed activation cannot upgrade the earlier proof at subsequent session issuance', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const mutation of ['generation', 'role']) {
      await withEnrollmentDatabase(async (database, secret) => {
        const actual = db.transaction, entered = deferred(), release = deferred();
        let paused = false;
        db.transaction = async work => {
          const result = await actual(work);
          if (!paused) { paused = true; entered.resolve(); await release.promise; }
          return result;
        };
        const pending = requestEnable(generateTotp(secret), role).then(response => response);
        try {
          await within(entered.promise, 'committed activation');
          if (mutation === 'generation') await database.query('UPDATE users SET session_version=2 WHERE id=$1', [enrollmentOwner]);
          else await database.query('UPDATE users SET role=$2 WHERE id=$1',
            [enrollmentOwner, role === 'super_admin' ? 'admin' : 'super_admin']);
          const committed = await state(database);
          expect(committed.users![0]!.totp_enabled).toBe(true);
          expect(committed.admin_backup_codes).toHaveLength(8);
          release.resolve();
          const response = await within(pending, 'revoked issuance');
          expect(response.status).toBe(401);
          expect(response.body.data).toBeUndefined();
          expect(response.headers['set-cookie']).toBeUndefined();
          expect(await state(database)).toEqual(committed);
          expect(committed.refresh_tokens).toEqual([]);
          expect(committed.admin_csrf_tokens).toEqual([]);
          // This deliberately exposes the remaining interrupted-delivery
          // boundary: already committed factor/codes are not rolled back.
        } finally {
          release.resolve(); await pending; db.transaction = actual;
        }
      }, role);
    }
  }
}, 60000);

it('failed activation recovery or audit writes roll back factor and metadata, and retry succeeds', async () => {
  for (const table of ['admin_backup_codes', 'admin_actions']) {
    await withEnrollmentDatabase(async (database, secret) => {
      const before = await state(database);
      await database.query(`CREATE FUNCTION fail_activation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic activation failure'; END $$;
        CREATE TRIGGER fail_activation BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION fail_activation();`);
      const denied = await requestEnable(generateTotp(secret));
      expect(denied.status).toBe(500);
      expect(denied.headers['set-cookie']).toBeUndefined();
      expect(denied.body.data).toBeUndefined();
      expect(await state(database)).toEqual(before);
      await database.query(`DROP TRIGGER fail_activation ON ${table}`);
      expect((await requestEnable(generateTotp(secret))).status).toBe(200);
      const after = await state(database);
      expect(after.users![0]!.totp_enabled).toBe(true);
      expect(after.admin_backup_codes).toHaveLength(8);
      expect(after.admin_actions).toHaveLength(1);
      expect(after.refresh_tokens).toHaveLength(1);
    });
  }
});
