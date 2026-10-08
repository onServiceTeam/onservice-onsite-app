import {
  enrollmentIt as it, enrollmentOwner, requestSetup, withEnrollmentDatabase,
  pauseEnrollmentAuthorization, within,
} from './helpers/admin-enrollment-postgres';
import type { QueryResultRow } from 'pg';
import { db } from '../src/models/db';
import { decryptSecret, generateTotpUri } from '../src/utils/totp';
import { deferred } from './helpers/admin-password-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';

it('eligible admin-tier enrollment stores the encrypted pending key, returns its QR data and creates no full session', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const type of ['access', 'pre_auth_2fa_setup']) {
      await withEnrollmentDatabase(async database => {
        if (type === 'pre_auth_2fa_setup') {
          await database.query('UPDATE users SET must_rotate_password=TRUE WHERE id=$1', [enrollmentOwner]);
        }
        const before = (await database.query('SELECT * FROM users')).rows[0];
        const response = await requestSetup(role, type);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(typeof response.body.data.secret === 'string' && /^[A-Z2-7]{32}$/.test(response.body.data.secret)).toBe(true);
        expect(response.body.data.uri === generateTotpUri(response.body.data.secret, before.email)).toBe(true);
        const after = (await database.query('SELECT * FROM users')).rows[0];
        expect(after.totp_secret.startsWith('enc:')).toBe(true);
        expect(decryptSecret(after.totp_secret) === response.body.data.secret).toBe(true);
        expect({ ...after, totp_secret: before.totp_secret, updated_at: before.updated_at }).toEqual(before);
        expect((await database.query('SELECT details FROM admin_actions')).rows).toEqual([{ details: { phase: 'setup', enabled: false } }]);
        for (const table of ['refresh_tokens', 'admin_csrf_tokens', 'admin_backup_codes']) {
          expect((await database.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
        }
      }, role);
    }
  }
});

it('setup waits for a concurrent account writer, rejecting committed revocation and accepting its rollback', async () => {
  for (const outcome of ['COMMIT', 'ROLLBACK']) {
    await withEnrollmentDatabase(async database => {
      const pause = pauseEnrollmentAuthorization();
      const pending = requestSetup().then(response => response);
      const writer = await database.connect();
      try {
        await within(pause.entered, 'initial authorization');
        await writer.query('BEGIN');
        const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
        await writer.query('UPDATE users SET session_version=2 WHERE id=$1', [enrollmentOwner]);
        pause.release();
        await waitForBlockedApproval(database, pid);
        await writer.query(outcome);
        const response = await within(pending, 'setup after account writer');
        expect(response.status).toBe(outcome === 'COMMIT' ? 401 : 200);
        expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows)
          .toEqual([{ count: outcome === 'COMMIT' ? 0 : 1 }]);
        expect((await database.query('SELECT session_version,totp_enabled FROM users')).rows)
          .toEqual([{ session_version: outcome === 'COMMIT' ? 2 : 1, totp_enabled: false }]);
      } finally {
        await writer.query('ROLLBACK'); writer.release();
        pause.release(); await pending; pause.restore();
      }
    });
  }
});

it('setup holding its account lock precedes a writer while unrelated enrollment continues', async () => {
  await withEnrollmentDatabase(async database => {
    const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await database.query(`INSERT INTO users (id,role,email,totp_enabled,must_rotate_password)
      VALUES ($1,'dpo','synthetic-other@example.invalid',FALSE,FALSE)`, [other]);
    const actual = db.transaction, entered = deferred(), release = deferred();
    let paused = false, pid = 0;
    db.transaction = async work => actual(async client => work({
      query: async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
        const result = await client.query<R>(sql, params);
        if (!paused && sql.includes('FROM users') && sql.includes('FOR NO KEY UPDATE') && params?.[0] === enrollmentOwner) {
          paused = true;
          pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
          entered.resolve(); await release.promise;
        }
        return result;
      },
    }));
    const pending = requestSetup().then(response => response);
    let mutation: Promise<unknown> | undefined;
    try {
      await within(entered.promise, 'locked setup');
      mutation = database.query('UPDATE users SET is_active=FALSE WHERE id=$1', [enrollmentOwner]);
      void mutation.catch(() => undefined);
      await waitForBlockedApproval(database, pid);
      const unrelated = await requestSetup('dpo', 'pre_auth_2fa_setup', other);
      expect(unrelated.status).toBe(200);
      release.resolve();
      expect((await within(pending, 'first setup commit')).status).toBe(200);
      await within(mutation, 'following deactivation');
      expect((await database.query('SELECT is_active,totp_enabled FROM users WHERE id=$1', [enrollmentOwner])).rows)
        .toEqual([{ is_active: false, totp_enabled: false }]);
      expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows).toEqual([{ count: 2 }]);
    } finally {
      release.resolve();
      await Promise.allSettled([pending, ...(mutation ? [mutation] : [])]);
      db.transaction = actual;
    }
  });
});
