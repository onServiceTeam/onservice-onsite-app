import crypto from 'node:crypto';
import { Socket } from 'node:net';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { db } from '../src/models/db';
import { beginEmailSignIn, completeEmailSignIn, type EmailSignInStart } from '../src/services/email-sign-in.service';
import { cleanupEmailSignInChallenges } from '../src/services/email-sign-in-cleanup.service';
import { beginEmailLink, completeEmailLink } from '../src/services/email-link.service';
import { refreshAccessToken } from '../src/services/auth.service';
import { gatherUserData, processExpiredCoolingOff } from '../src/services/data-management.service';
import { withSessionDatabase, sessionOwner, sessionSecret, sessionHash, seedDeletion } from './helpers/account-session-postgres';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const url = new URL(databaseUrl);
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && ['localhost', '127.0.0.1'].includes(url.hostname) && !url.search && !url.hash
      && /^\/[a-zA-Z0-9_]+_test$/.test(url.pathname);
  } catch { return false; }
})();
if (process.env.CI && !safeDatabase) throw new Error('Email sign-in requires the isolated loopback *_test PostgreSQL service in CI.');
const sqlIt = safeDatabase ? it : it.skip;
const email = 'Verified.Owner+services@example.invalid', ip = '192.0.2.51';
const digest = (value: string) => crypto.createHash('sha256').update(value.toLowerCase()).digest('hex');
const submit = (proof: EmailSignInStart) => completeEmailSignIn(proof.id, proof.delivery!.code,
  { deviceFingerprint: 'synthetic-email-fingerprint', ipAddress: ip });

// Verify actual TCP peer/database BEFORE schema creation. No URL overrides,
// live fallbacks, source-regex evidence or mocked SQL in these service tests.
async function withDatabase(run: (database: Pool) => Promise<void>, role = 'customer'): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe email sign-in test database.');
  const verifier = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const connection = await verifier.connect();
    try {
      const socket = connection.connection.stream, url = new URL(databaseUrl!);
      const identity = await connection.query('SELECT current_database() AS name');
      if (!(socket instanceof Socket) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress ?? '')
          || socket.remotePort !== Number(url.port || '5432') || identity.rows[0].name !== url.pathname.slice(1)) {
        throw new Error('Email sign-in test database identity mismatch.');
      }
    } finally { connection.release(); }
  } finally { await verifier.end(); }
  await withSessionDatabase(async database => {
    await database.query(`CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id), action varchar(100), entity_type varchar(50),
      entity_id uuid, old_values jsonb, new_values jsonb, created_at timestamptz DEFAULT NOW())`);
    await run(database);
  }, role);
}

async function seedIdentity(database: Pool): Promise<void> {
  await database.query(`INSERT INTO sign_in_email_identities (user_id,email,email_key,proof_id)
    VALUES ($1,$2,lower($2),$3)`, [sessionOwner, email, crypto.randomUUID()]);
}
async function counts(database: Pool): Promise<Record<string, number>> {
  return (await database.query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM refresh_tokens) AS sessions,
    (SELECT count(*)::int FROM audit_log WHERE action='email_sign_in') AS sign_ins`)).rows[0];
}
async function snapshot(database: Pool): Promise<unknown> {
  return { user: (await database.query('SELECT * FROM users ORDER BY id')).rows,
    tokens: (await database.query('SELECT * FROM refresh_tokens ORDER BY id')).rows,
    audits: (await database.query('SELECT * FROM audit_log ORDER BY id')).rows,
    proofs: (await database.query('SELECT * FROM email_sign_in_challenges ORDER BY id')).rows };
}
async function ageRequests(database: Pool): Promise<void> {
  await database.query(`UPDATE email_sign_in_challenges SET created_at=clock_timestamp()-INTERVAL '2 minutes',
    expires_at=clock_timestamp()+INTERVAL '3 minutes'`);
}

it('email sign-in rejects malformed input and unbounded cleanup before any database transaction', async () => {
  const transaction = jest.spyOn(db, 'transaction');
  try {
    for (const address of ['bad-email', 'bad\nheader@example.invalid', 'é@example.invalid', `${'a'.repeat(250)}@example.invalid`]) {
      await expect(beginEmailSignIn(address, ip)).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(beginEmailSignIn(email, 'not-an-ip')).rejects.toMatchObject({ statusCode: 400 });
    await expect(beginEmailSignIn(email, ip, 'not-an-operation-id')).rejects.toMatchObject({ statusCode: 400 });
    await expect(completeEmailSignIn('bad-id', '123456')).rejects.toMatchObject({ statusCode: 400 });
    await expect(completeEmailSignIn(crypto.randomUUID(), '12345')).rejects.toMatchObject({ statusCode: 400 });
    await expect(completeEmailSignIn(crypto.randomUUID(), '123456', { deviceFingerprint: 'short' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(completeEmailSignIn(crypto.randomUUID(), '123456', { ipAddress: 'bad' })).rejects.toMatchObject({ statusCode: 400 });
    for (const limit of [0, -1, 501, 1.5, NaN, Infinity]) await expect(cleanupEmailSignInChallenges(limit)).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction).not.toHaveBeenCalled();
  } finally { transaction.mockRestore(); }
});

for (const role of ['customer', 'provider', 'provider_staff']) {
  sqlIt(`verified ${role} email signs in once with the existing canonical session and refresh authority`, async () => {
    await withDatabase(async database => {
      if (role === 'customer') {
        const owner = { userId: sessionOwner, role: 'customer' as const, sessionVersion: 1 };
        const link = await beginEmailLink(owner, email, ip);
        expect(await completeEmailLink(owner, link.id, link.phoneCode, link.emailCode)).toEqual({ status: 'linked', email });
      } else await seedIdentity(database);
      const profile = (await database.query('SELECT * FROM users WHERE id=$1', [sessionOwner])).rows[0];
      const proof = await beginEmailSignIn(` ${email.toUpperCase()} `, ip);
      expect(proof.delivery).toEqual({ deliveryId: proof.id, email, purpose: 'sign_in', code: expect.stringMatching(/^\d{6}$/), expiresAt: proof.expiresAt });
      const stored = (await database.query('SELECT * FROM email_sign_in_challenges WHERE id=$1', [proof.id])).rows[0];
      expect(stored).toMatchObject({ user_id: sessionOwner, role, session_version: 1, phone: profile.phone,
        recipient_hash: digest(email), state: 'pending', code_hash: expect.stringMatching(/^[a-f0-9]{32}:[a-f0-9]{128}$/) });
      const result = await submit(proof);
      expect(result.status).toBe('signed_in');
      if (result.status !== 'signed_in') throw new Error('Expected verified sign-in');
      expect(result.user).toEqual({ id: sessionOwner, phone: profile.phone, email: profile.email, role,
        firstName: profile.first_name, lastName: profile.last_name, avatarUrl: profile.avatar_url, isVerified: true });
      expect(result.isNewUser).toBe(false);
      expect(jwt.verify(result.accessToken, sessionSecret)).toMatchObject({ userId: sessionOwner, role, sessionVersion: 1 });
      expect(jwt.verify(result.refreshToken, sessionSecret)).toMatchObject({ userId: sessionOwner, role, sessionVersion: 1, type: 'refresh', jti: expect.any(String) });
      expect((await database.query('SELECT * FROM refresh_tokens WHERE token_hash=$1', [sessionHash(result.refreshToken)])).rows[0])
        .toMatchObject({ user_id: sessionOwner, device_fingerprint: 'synthetic-email-fingerprint', created_ip: ip });
      expect((await database.query('SELECT * FROM users WHERE id=$1', [sessionOwner])).rows[0])
        .toEqual({ ...profile, last_login_at: expect.any(Date), updated_at: expect.any(Date) });
      expect((await database.query('SELECT state,code_hash FROM email_sign_in_challenges WHERE id=$1', [proof.id])).rows)
        .toEqual([{ state: 'consumed', code_hash: null }]);
      expect((await database.query("SELECT new_values FROM audit_log WHERE action='email_sign_in'")).rows)
        .toEqual([{ new_values: { method: 'email', proofId: proof.id } }]);
      expect(await submit(proof)).toEqual({ status: 'invalid' });
      expect(await counts(database)).toEqual({ users: 1, sessions: 2, sign_ins: 1 });
      const refreshed = await refreshAccessToken(result.refreshToken, { deviceFingerprint: 'synthetic-email-fingerprint', ipAddress: ip });
      expect(jwt.verify(refreshed.accessToken, sessionSecret)).toMatchObject({ userId: sessionOwner, role, sessionVersion: 1 });
      await database.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
      await expect(refreshAccessToken(refreshed.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
      expect(await counts(database)).toEqual({ users: 1, sessions: 2, sign_ins: 1 });
    }, role);
  }, 15000);
}

sqlIt('unknown and legacy contact-only emails prepare unowned proofs without creating or merging accounts', async () => {
  await withDatabase(async database => {
    for (const address of ['Unknown@example.invalid', 'synthetic-session@example.invalid']) {
      const proof = await beginEmailSignIn(address, ip);
      expect(proof.delivery).toBeNull();
      expect((await database.query('SELECT * FROM email_sign_in_challenges WHERE id=$1', [proof.id])).rows[0])
        .toMatchObject({ user_id: null, identity_proof_id: null, role: null, phone: null, session_version: null, state: 'pending' });
      expect(await completeEmailSignIn(proof.id, '123456')).toEqual({ status: 'invalid' });
    }
    expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
    expect((await database.query('SELECT count(*)::int AS count FROM sign_in_email_identities')).rows[0].count).toBe(0);
  });
});

for (const role of ['admin', 'super_admin', 'dpo', 'unknown_role']) {
  sqlIt(`email proof preparation does not bypass ${role} sign-in requirements even with a retained verified identity`, async () => {
    await withDatabase(async database => {
      await seedIdentity(database);
      const before = (await database.query('SELECT * FROM users')).rows;
      const proof = await beginEmailSignIn(email, ip);
      expect(proof.delivery).toBeNull();
      expect(await completeEmailSignIn(proof.id, '123456')).toEqual({ status: 'invalid' });
      expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
    }, role);
  });
}

sqlIt('concurrent consumption of one real email proof commits exactly one login session and rejects every replay', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const proof = await beginEmailSignIn(email, ip);
    const results = await Promise.all([submit(proof), submit(proof), submit(proof)]);
    expect(results.filter(result => result.status === 'signed_in')).toHaveLength(1);
    expect(results.filter(result => result.status === 'invalid')).toHaveLength(2);
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    expect(await counts(database)).toEqual({ users: 1, sessions: 2, sign_ins: 1 });
  });
});

sqlIt('wrong email codes consume the durable three-attempt budget without issuing credentials', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const proof = await beginEmailSignIn(email, ip), wrong = proof.delivery!.code === '999999' ? '999998' : '999999';
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(await completeEmailSignIn(proof.id, wrong)).toEqual({ status: 'invalid' });
      expect((await database.query('SELECT attempts FROM email_sign_in_challenges WHERE id=$1', [proof.id])).rows[0].attempts).toBe(attempt);
    }
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    expect((await database.query('SELECT state,code_hash FROM email_sign_in_challenges')).rows).toEqual([{ state: 'invalidated', code_hash: null }]);
    expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
  });
}, 15000);

sqlIt('email linking IDs and substituted recipient hashes are not interchangeable with sign-in proof authority', async () => {
  await withDatabase(async database => {
    const actor = { userId: sessionOwner, role: 'customer' as const, sessionVersion: 1 };
    const link = await beginEmailLink(actor, email, ip);
    expect(await completeEmailSignIn(link.id, link.emailCode)).toEqual({ status: 'invalid' });
    expect(await completeEmailLink(actor, link.id, link.phoneCode, link.emailCode)).toEqual({ status: 'linked', email });
    const proof = await beginEmailSignIn(email, ip);
    await database.query('UPDATE email_sign_in_challenges SET recipient_hash=$1 WHERE id=$2', [digest('Other@example.invalid'), proof.id]);
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
  });
}, 15000);

for (const [name, change] of [
  ['revoked generation', 'UPDATE users SET session_version=2'],
  ['promoted role', "UPDATE users SET role='admin'"],
  ['changed phone', "UPDATE users SET phone='+639180000000'"],
  ['deactivated account', 'UPDATE users SET is_active=FALSE'],
  ['unverified phone', 'UPDATE users SET is_verified=FALSE'],
  ['replaced identity proof', 'UPDATE sign_in_email_identities SET proof_id=gen_random_uuid()'],
  ['removed identity', 'DELETE FROM sign_in_email_identities'],
] as const) {
  sqlIt(`email completion rejects ${name} instead of inheriting new authority`, async () => {
    await withDatabase(async database => {
      await seedIdentity(database);
      const proof = await beginEmailSignIn(email, ip);
      await database.query(change);
      const before = (await database.query('SELECT * FROM users')).rows;
      expect(await submit(proof)).toEqual({ status: 'invalid' });
      expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
      expect((await database.query('SELECT state,code_hash FROM email_sign_in_challenges')).rows).toEqual([{ state: 'invalidated', code_hash: null }]);
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
    });
  });
}

sqlIt('a real account-lock wait observes revocation committed before email verification acquires authority', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const proof = await beginEmailSignIn(email, ip), blocker = await database.connect();
    let pending: ReturnType<typeof submit> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [sessionOwner]);
      pending = submit(proof);
      await waitForBlockedApproval(database, pid);
      await blocker.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
      await blocker.query('COMMIT');
      expect(await pending).toEqual({ status: 'invalid' });
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
    } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending; }
  });
}, 15000);

sqlIt('expiry during a real audit lock wait rolls back minted session and login metadata before invalidating the proof', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const proof = await beginEmailSignIn(email, ip);
    await database.query(`UPDATE email_sign_in_challenges SET created_at=clock_timestamp()-INTERVAL '4 minutes',
      expires_at=clock_timestamp()+INTERVAL '5 seconds' WHERE id=$1`, [proof.id]);
    const profile = (await database.query('SELECT * FROM users')).rows;
    await database.query(`CREATE FUNCTION wait_email_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(817826341); RETURN NEW; END; $$;
      CREATE TRIGGER wait_email_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION wait_email_audit()`);
    const blocker = await database.connect();
    let pending: ReturnType<typeof submit> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT pg_advisory_xact_lock(817826341)');
      pending = submit(proof);
      await waitForBlockedApproval(database, pid);
      await blocker.query(`SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM
        (SELECT expires_at FROM email_sign_in_challenges WHERE id=$1)-clock_timestamp()))+0.05)`, [proof.id]);
      await blocker.query('COMMIT');
      expect(await pending).toEqual({ status: 'invalid' });
      expect((await database.query('SELECT * FROM users')).rows).toEqual(profile);
      expect(await counts(database)).toEqual({ users: 1, sessions: 1, sign_ins: 0 });
      expect((await database.query('SELECT state,code_hash FROM email_sign_in_challenges')).rows).toEqual([{ state: 'invalidated', code_hash: null }]);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending; }
  });
}, 15000);

for (const [table, event] of [['refresh_tokens', 'INSERT'], ['users', 'UPDATE'], ['audit_log', 'INSERT'], ['email_sign_in_challenges', 'UPDATE']] as const) {
  sqlIt(`actual ${table} failure rolls back the complete email sign-in and leaves the same proof retryable`, async () => {
    await withDatabase(async database => {
      await seedIdentity(database);
      const proof = await beginEmailSignIn(email, ip), before = await snapshot(database);
      await database.query(`CREATE FUNCTION reject_email_sign_in() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic email sign-in failure'; END; $$;
        CREATE TRIGGER reject_email_sign_in BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_email_sign_in()`);
      await expect(submit(proof)).rejects.toThrow('Synthetic email sign-in failure');
      expect(await snapshot(database)).toEqual(before);
      await database.query(`DROP TRIGGER reject_email_sign_in ON ${table}`);
      expect(await submit(proof)).toMatchObject({ status: 'signed_in' });
      expect(await counts(database)).toEqual({ users: 1, sessions: 2, sign_ins: 1 });
    });
  }, 15000);
}

for (const [table, event] of [['refresh_tokens', 'INSERT'], ['users', 'UPDATE'], ['audit_log', 'INSERT'], ['email_sign_in_challenges', 'UPDATE']] as const) {
  sqlIt(`a suppressed ${table} write cannot return email credentials or consume the proof`, async () => {
    await withDatabase(async database => {
      await seedIdentity(database);
      const proof = await beginEmailSignIn(email, ip), before = await snapshot(database);
      await database.query(`CREATE FUNCTION suppress_email_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RETURN NULL; END; $$;
        CREATE TRIGGER suppress_email_write BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION suppress_email_write()`);
      await expect(submit(proof)).rejects.toMatchObject({ statusCode: 500 });
      expect(await snapshot(database)).toEqual(before);
    });
  });
}

sqlIt('concurrent starts enforce case-insensitive cooldown, replace old proof after cooldown and enforce canonical IP hourly limits', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const starts = await Promise.allSettled([beginEmailSignIn(email, '::ffff:192.0.2.51'), beginEmailSignIn(email.toLowerCase(), ip)]);
    expect(starts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(starts.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 429 } });
    const first = starts.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<EmailSignInStart>;
    await ageRequests(database);
    const next = await beginEmailSignIn(email, ip);
    expect(await submit(first.value)).toEqual({ status: 'invalid' });
    expect(await submit(next)).toMatchObject({ status: 'signed_in' });
    await ageRequests(database);
    for (let n = 0; n < 3; n++) {
      await database.query(`INSERT INTO email_sign_in_challenges
        (id,purpose,recipient_hash,request_ip,code_hash,max_attempts,state,created_at,expires_at,finished_at)
        SELECT $1,'sign_in',$2,$3::inet,NULL,3,'invalidated',t.now-INTERVAL '2 minutes',
          t.now+INTERVAL '3 minutes',t.now FROM (SELECT clock_timestamp() AS now) t`, [crypto.randomUUID(), digest(email), ip]);
    }
    await expect(beginEmailSignIn(email.toUpperCase(), '192.0.2.52')).rejects.toMatchObject({ statusCode: 429 });
    await expect(beginEmailSignIn('Different@example.invalid', '::ffff:192.0.2.51')).rejects.toMatchObject({ statusCode: 429 });
    expect((await database.query('SELECT count(*)::int AS count FROM email_sign_in_challenges')).rows[0].count).toBe(5);
  });
}, 15000);

sqlIt('owner export excludes proof secrets and unowned requests while partial anonymization atomically removes owned sign-in records', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const proof = await beginEmailSignIn(email, ip);
    const decoy = await beginEmailSignIn('Unknown@example.invalid', ip);
    const original = db.query;
    db.query = async (sql, params) => sql.includes('FROM email_sign_in_challenges') ? original(sql, params)
      : { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    try {
      const data = await gatherUserData(sessionOwner);
      expect(data.emailSignInRequests).toEqual([{ state: 'pending', attempts: 0, request_ip: ip,
        created_at: expect.any(Date), expires_at: expect.any(Date), finished_at: null,
        delivery_state: 'not_started', delivery_started_at: null, delivery_finished_at: null }]);
      expect((await gatherUserData(crypto.randomUUID())).emailSignInRequests).toEqual([]);
      for (const secret of [proof.id, proof.delivery!.code, digest(email), 'code_hash', 'identity_proof_id', decoy.id]) {
        expect(JSON.stringify(data)).not.toContain(JSON.stringify(secret));
      }
    } finally { db.query = original; }
    await seedDeletion(database);
    await database.query(`CREATE FUNCTION reject_email_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic email erasure failure'; END; $$;
      CREATE TRIGGER reject_email_erasure BEFORE DELETE ON email_sign_in_challenges FOR EACH ROW EXECUTE FUNCTION reject_email_erasure()`);
    const before = await snapshot(database);
    expect(await processExpiredCoolingOff()).toBe(0);
    expect(await snapshot(database)).toEqual(before);
    await database.query('DROP TRIGGER reject_email_erasure ON email_sign_in_challenges');
    expect(await processExpiredCoolingOff()).toBe(1);
    expect((await database.query('SELECT id FROM email_sign_in_challenges ORDER BY id')).rows).toEqual([{ id: decoy.id }]);
    expect((await database.query('SELECT count(*)::int AS count FROM sign_in_email_identities')).rows[0].count).toBe(0);
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    expect(await counts(database)).toEqual({ users: 1, sessions: 0, sign_ins: 0 });
  });
}, 15000);

async function seedCleanup(database: Pool, state: 'pending' | 'invalidated', ageDays: number): Promise<string> {
  const id = crypto.randomUUID();
  await database.query(`INSERT INTO email_sign_in_challenges
    (id,purpose,recipient_hash,request_ip,code_hash,max_attempts,state,created_at,expires_at,finished_at)
    SELECT $1,'sign_in',$2,$3::inet,CASE WHEN $4='pending' THEN 'synthetic-expired-hash' END,
      3,$4,t.now,t.now+INTERVAL '5 minutes',CASE WHEN $4='invalidated' THEN t.now+INTERVAL '1 minute' END
      FROM (SELECT clock_timestamp()-($5*INTERVAL '1 day') AS now) t`, [id, digest(id), ip, state, ageDays]);
  return id;
}

sqlIt('bounded cleanup clears expired sign-in secrets and old decoys while preserving current proofs, recent counters and identities', async () => {
  await withDatabase(async database => {
    await seedIdentity(database);
    const current = await beginEmailSignIn(email, ip);
    const expired = await seedCleanup(database, 'pending', 1);
    const old = await seedCleanup(database, 'invalidated', 91);
    const recent = await seedCleanup(database, 'invalidated', 89);
    expect(await cleanupEmailSignInChallenges(2)).toEqual({ proofsExpired: 1, requestsPurged: 1 });
    expect((await database.query('SELECT state,code_hash FROM email_sign_in_challenges WHERE id=$1', [expired])).rows)
      .toEqual([{ state: 'invalidated', code_hash: null }]);
    expect((await database.query('SELECT id FROM email_sign_in_challenges WHERE id=$1', [old])).rowCount).toBe(0);
    expect((await database.query('SELECT id FROM email_sign_in_challenges WHERE id=$1', [recent])).rowCount).toBe(1);
    await expect(beginEmailSignIn(email, ip)).rejects.toMatchObject({ statusCode: 429 });
    expect(await submit(current)).toMatchObject({ status: 'signed_in' });
    expect(await cleanupEmailSignInChallenges()).toEqual({ proofsExpired: 0, requestsPurged: 0 });
  });
});

sqlIt('concurrent sign-in cleanup skips real locked rows and rolls back the batch on a retention delete failure', async () => {
  await withDatabase(async database => {
    const expired = await seedCleanup(database, 'pending', 1);
    await seedCleanup(database, 'pending', 1);
    await seedCleanup(database, 'pending', 1);
    const old = await seedCleanup(database, 'invalidated', 91), blocker = await database.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM email_sign_in_challenges WHERE id=ANY($1::uuid[]) FOR UPDATE', [[expired, old]]);
      const results = await Promise.all([cleanupEmailSignInChallenges(1), cleanupEmailSignInChallenges(1)]);
      expect(results).toEqual([{ proofsExpired: 1, requestsPurged: 0 }, { proofsExpired: 1, requestsPurged: 0 }]);
      await blocker.query('COMMIT');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    await database.query(`CREATE FUNCTION reject_sign_in_purge() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic sign-in purge failure'; END; $$;
      CREATE TRIGGER reject_sign_in_purge BEFORE DELETE ON email_sign_in_challenges FOR EACH ROW EXECUTE FUNCTION reject_sign_in_purge()`);
    const before = await snapshot(database);
    await expect(cleanupEmailSignInChallenges(1)).rejects.toThrow('Synthetic sign-in purge failure');
    expect(await snapshot(database)).toEqual(before);
    await database.query('DROP TRIGGER reject_sign_in_purge ON email_sign_in_challenges');
    expect(await cleanupEmailSignInChallenges(1)).toEqual({ proofsExpired: 1, requestsPurged: 1 });
  });
});
