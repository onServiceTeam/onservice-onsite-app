import jwt from 'jsonwebtoken';
import type { QueryResultRow } from 'pg';
import { db } from '../src/models/db';
import { refreshAccessToken } from '../src/services/auth.service';
import { processExpiredCoolingOff } from '../src/services/data-management.service';
import { getSettingBoolean } from '../src/services/settings.service';
import { deferred, within } from './helpers/admin-password-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { sessionIntegrationIt as it, sessionOwner, sessionHash, seedDeletion, withSessionDatabase } from './helpers/account-session-postgres';

jest.mock('../src/services/settings.service', () => ({ getSettingBoolean: jest.fn().mockResolvedValue(false) }));

// Scheduling hook only. Every service statement and transaction still runs
// against PostgreSQL, including the statement at which the hook pauses.
function pauseStatement(matches: (sql: string) => boolean) {
  const actual = db.transaction, entered = deferred(), release = deferred();
  let paused = false, pid = 0;
  db.transaction = async work => actual(async client => work({
    query: async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
      const result = await client.query<R>(sql, params);
      if (!paused && matches(sql)) {
        paused = true;
        pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        entered.resolve(); await release.promise;
      }
      return result;
    },
  }));
  return { entered: entered.promise, pid: () => pid, release: release.resolve,
    restore: () => { db.transaction = actual; } };
}

it('simultaneous refreshes have one winner and preserve fingerprint/session claims on the replacement', async () => {
  await withSessionDatabase(async (database, token) => {
    const results = await Promise.allSettled([refreshAccessToken(token), refreshAccessToken(token)]);
    const winners = results.filter(result => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ statusCode: 401 }) }),
    ]);
    const pair = winners[0]!.value;
    expect(jwt.decode(pair.accessToken)).toMatchObject({ userId: sessionOwner, role: 'customer', sessionVersion: 1 });
    expect(jwt.decode(pair.refreshToken)).toMatchObject({ userId: sessionOwner, type: 'refresh', sessionVersion: 1 });
    expect(pair.refreshToken).not.toBe(token);
    expect((await database.query('SELECT token_hash,device_fingerprint FROM refresh_tokens')).rows)
      .toEqual([{ token_hash: sessionHash(pair.refreshToken), device_fingerprint: 'synthetic-fingerprint' }]);
  });
});

it('a replacement insert failure rolls the old token deletion back in PostgreSQL', async () => {
  await withSessionDatabase(async (database, token) => {
    await database.query(`CREATE FUNCTION fail_rotation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic rotation failure'; END $$;
      CREATE TRIGGER fail_rotation BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION fail_rotation();`);
    await expect(refreshAccessToken(token)).rejects.toThrow('synthetic rotation failure');
    expect((await database.query('SELECT token_hash FROM refresh_tokens')).rows).toEqual([{ token_hash: sessionHash(token) }]);
    await database.query('DROP TRIGGER fail_rotation ON refresh_tokens');
    await expect(refreshAccessToken(token)).resolves.toHaveProperty('accessToken');
  });
});

it('the separate fingerprint audit insert can commit under the account lock in observe and strict modes', async () => {
  await withSessionDatabase(async (database, token) => {
    const pair = await refreshAccessToken(token, { deviceFingerprint: 'changed-fingerprint', ipAddress: '192.0.2.1' });
    jest.mocked(getSettingBoolean).mockResolvedValueOnce(true);
    await expect(refreshAccessToken(pair.refreshToken, { deviceFingerprint: 'third-fingerprint' }))
      .rejects.toMatchObject({ statusCode: 401 });
    expect((await database.query('SELECT count(*)::int AS count FROM security_events')).rows).toEqual([{ count: 2 }]);
    expect((await database.query('SELECT token_hash,device_fingerprint FROM refresh_tokens')).rows)
      .toEqual([{ token_hash: sessionHash(pair.refreshToken), device_fingerprint: 'changed-fingerprint' }]);
  });
});

it('rotation and partial anonymization serialize in either order without leaving a replacement session behind', async () => {
  for (const first of ['rotation', 'anonymization']) {
    await withSessionDatabase(async (database, token) => {
      await seedDeletion(database);
      const pause = pauseStatement(sql => first === 'rotation'
        ? sql.includes('SELECT * FROM refresh_tokens') && sql.includes('FOR UPDATE')
        : sql === 'DELETE FROM refresh_tokens WHERE user_id = $1');
      const operations: Promise<unknown>[] = [];
      try {
        operations.push(first === 'rotation' ? refreshAccessToken(token) : processExpiredCoolingOff());
        // Attach rejection handlers before scheduling either concurrent path.
        void operations[0]!.catch(() => undefined);
        await within(pause.entered, 'first session operation');
        operations.push(first === 'rotation' ? processExpiredCoolingOff() : refreshAccessToken(token));
        void operations[1]!.catch(() => undefined);
        await waitForBlockedApproval(database, pause.pid());
        pause.release();
        const results = await Promise.allSettled(operations);
        expect(results[first === 'rotation' ? 1 : 0]).toEqual({ status: 'fulfilled', value: 1 });
        if (first === 'rotation') expect(results[0]).toMatchObject({ status: 'fulfilled', value: { accessToken: expect.any(String) } });
        else expect(results[1]).toMatchObject({ status: 'rejected', reason: { statusCode: 401 } });
        expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 0 }]);
        expect((await database.query('SELECT is_active FROM users')).rows).toEqual([{ is_active: false }]);
      } finally {
        pause.release(); await Promise.allSettled(operations); pause.restore();
      }
    });
  }
}, 30000);

it('partial cascade failure preserves identity, sessions and contact rows, then the existing worker retries', async () => {
  await withSessionDatabase(async (database, token) => {
    await seedDeletion(database);
    const before = (await database.query('SELECT phone,email,first_name,is_active FROM users')).rows;
    await database.query(`CREATE FUNCTION fail_cascade() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic cascade failure'; END $$;
      CREATE TRIGGER fail_cascade BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION fail_cascade();`);
    expect(await processExpiredCoolingOff()).toBe(0);
    expect((await database.query('SELECT phone,email,first_name,is_active FROM users')).rows).toEqual(before);
    expect((await database.query('SELECT token_hash FROM refresh_tokens')).rows).toEqual([{ token_hash: sessionHash(token) }]);
    expect((await database.query('SELECT address FROM user_addresses')).rows).toEqual([{ address: 'Synthetic address' }]);
    expect((await database.query('SELECT token FROM push_tokens')).rows).toEqual([{ token: 'synthetic-push' }]);
    expect((await database.query('SELECT status,processed_at FROM account_deletion_requests')).rows)
      .toEqual([{ status: 'processing', processed_at: null }]);
    await database.query('DROP TRIGGER fail_cascade ON reviews');
    expect(await processExpiredCoolingOff()).toBe(1);
    expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 0 }]);
  });
});
