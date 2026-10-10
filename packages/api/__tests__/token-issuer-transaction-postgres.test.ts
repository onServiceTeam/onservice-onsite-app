import jwt from 'jsonwebtoken';
import type { QueryResultRow } from 'pg';
import { db } from '../src/models/db';
import { createTokenPair, refreshAccessToken } from '../src/services/auth.service';
import { deferred, within } from './helpers/admin-password-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { sessionIntegrationIt as it, sessionOwner, sessionHash, withSessionDatabase } from './helpers/account-session-postgres';

it('current authority still receives signed and persisted credentials for every account role', async () => {
  for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo']) {
    await withSessionDatabase(async database => {
      await database.query('UPDATE users SET session_version=7 WHERE id=$1', [sessionOwner]);
      const account = (await database.query('SELECT * FROM users')).rows;
      const pair = await createTokenPair(sessionOwner, role, 7);
      for (const token of [pair.accessToken, pair.refreshToken]) {
        expect(jwt.verify(token, process.env.JWT_SECRET!))
          .toMatchObject({ userId: sessionOwner, role, sessionVersion: 7 });
      }
      expect((await database.query('SELECT user_id FROM refresh_tokens WHERE token_hash=$1',
        [sessionHash(pair.refreshToken)])).rows).toEqual([{ user_id: sessionOwner }]);
      expect((await database.query('SELECT * FROM users')).rows).toEqual(account);
    }, role);
  }
});

it('a waiting issuer rejects a committed authority change but accepts the original proof after writer rollback', async () => {
  for (const role of ['admin', 'super_admin', 'dpo', 'provider_staff']) {
    for (const outcome of ['COMMIT', 'ROLLBACK']) {
      await withSessionDatabase(async database => {
        const sessions = (await database.query('SELECT * FROM refresh_tokens')).rows;
        const writer = await database.connect();
        let issuance: Promise<{ outcome: string; statusCode?: number }> | undefined;
        try {
          await writer.query('BEGIN');
          const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
          await writer.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
          issuance = createTokenPair(sessionOwner, role, 1).then(() => ({ outcome: 'issued' }),
            (error: { statusCode?: number }) => ({ outcome: 'denied', statusCode: error.statusCode }));
          await waitForBlockedApproval(database, pid);
          await writer.query(outcome);
          expect(await issuance).toEqual(outcome === 'COMMIT'
            ? { outcome: 'denied', statusCode: 401 } : { outcome: 'issued' });
          if (outcome === 'COMMIT') {
            expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessions);
          } else {
            expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows)
              .toEqual([{ count: sessions.length + 1 }]);
          }
          expect((await database.query('SELECT role,session_version FROM users')).rows)
            .toEqual([{ role, session_version: outcome === 'COMMIT' ? 2 : 1 }]);
        } finally {
          await writer.query('ROLLBACK'); writer.release();
          if (issuance) await issuance;
        }
      }, role);
    }
  }
});

it('an issuer holding the account lock precedes revocation without holding up another account', async () => {
  await withSessionDatabase(async database => {
    const otherOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await database.query("INSERT INTO users (id,phone,role) VALUES ($1,'+639170000001','provider_staff')", [otherOwner]);
    const actual = db.transaction, entered = deferred(), release = deferred();
    let paused = false, pid = 0;
    // Scheduling hook only: all statements, locks and commits are real SQL.
    db.transaction = async work => actual(async client => work({
      query: async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
        const result = await client.query<R>(sql, params);
        if (!paused && sql.includes('FROM users WHERE id') && params?.[0] === sessionOwner) {
          paused = true;
          pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
          entered.resolve(); await release.promise;
        }
        return result;
      },
    }));
    const issuance = createTokenPair(sessionOwner, 'admin', 1);
    void issuance.catch(() => undefined);
    let revocation: Promise<void> | undefined;
    try {
      await within(entered.promise, 'locked credential issuer');
      revocation = (async () => {
        const writer = await database.connect();
        try {
          await writer.query('BEGIN');
          await writer.query('UPDATE users SET session_version=session_version+1 WHERE id=$1', [sessionOwner]);
          await writer.query('DELETE FROM refresh_tokens WHERE user_id=$1', [sessionOwner]);
          await writer.query('COMMIT');
        } catch (error) { await writer.query('ROLLBACK'); throw error; }
        finally { writer.release(); }
      })();
      void revocation.catch(() => undefined);
      await waitForBlockedApproval(database, pid);
      const unrelated = await within(createTokenPair(otherOwner, 'provider_staff', 1), 'independent issuer');
      release.resolve();
      const issued = await within(issuance, 'issuer commit');
      await within(revocation, 'revocation commit');
      expect((await database.query('SELECT user_id,token_hash FROM refresh_tokens')).rows)
        .toEqual([{ user_id: otherOwner, token_hash: sessionHash(unrelated.refreshToken) }]);
      await expect(refreshAccessToken(issued.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
      expect((await database.query('SELECT session_version FROM users WHERE id=$1', [sessionOwner])).rows)
        .toEqual([{ session_version: 2 }]);
    } finally {
      release.resolve();
      await Promise.allSettled([issuance, ...(revocation ? [revocation] : [])]);
      db.transaction = actual;
    }
  }, 'admin');
});

it('a failed credential insert preserves account and existing sessions and permits a later retry', async () => {
  await withSessionDatabase(async database => {
    const accounts = (await database.query('SELECT * FROM users')).rows;
    const sessions = (await database.query('SELECT * FROM refresh_tokens')).rows;
    await database.query(`CREATE FUNCTION fail_issuance() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic credential storage failure'; END $$;
      CREATE TRIGGER fail_issuance BEFORE INSERT ON refresh_tokens
      FOR EACH ROW EXECUTE FUNCTION fail_issuance();`);
    await expect(createTokenPair(sessionOwner, 'admin', 1)).rejects.toThrow('Synthetic credential storage failure');
    expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
    expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessions);
    await database.query('DROP TRIGGER fail_issuance ON refresh_tokens');
    await createTokenPair(sessionOwner, 'admin', 1);
    expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows)
      .toEqual([{ count: sessions.length + 1 }]);
  }, 'admin');
});

it('invalid supplied session generations are rejected without changing account or session storage', async () => {
  await withSessionDatabase(async database => {
    const accounts = (await database.query('SELECT * FROM users')).rows;
    const sessions = (await database.query('SELECT * FROM refresh_tokens')).rows;
    for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(createTokenPair(sessionOwner, 'admin', version)).rejects.toThrow('Invalid session version');
    }
    expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
    expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessions);
  }, 'admin');
});
