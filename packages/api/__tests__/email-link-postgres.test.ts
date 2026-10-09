import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { Pool } from 'pg';
import { db } from '../src/models/db';
import { beginEmailLink, completeEmailLink, type EmailLinkActor, type EmailLinkDelivery } from '../src/services/email-link.service';
import { gatherUserData, processExpiredCoolingOff } from '../src/services/data-management.service';
import { cleanupEmailLinkChallenges } from '../src/services/email-link-cleanup.service';
import { withSessionDatabase, sessionOwner, seedDeletion } from './helpers/account-session-postgres';
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
if (process.env.CI && !safeDatabase) throw new Error('Email linking requires the isolated loopback *_test PostgreSQL service in CI.');
const sqlIt = safeDatabase ? it : it.skip;
const actor: EmailLinkActor = { userId: sessionOwner, role: 'customer', sessionVersion: 1 };
const email = 'New.Owner+services@example.invalid';
const ip = '192.0.2.1';
const submit = (proof: EmailLinkDelivery, account = actor) => completeEmailLink(account, proof.id, proof.phoneCode, proof.emailCode);

// Inspect the actual connected peer and database BEFORE creating any schema.
// No host/protocol/query override, translated server-interface assumption or
// live database fallback. The scoped fixture owns and cleans its own schema.
async function withDatabase(run: (database: Pool) => Promise<void>, role: EmailLinkActor['role'] = 'customer'): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe email linking test database.');
  const verifier = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const connection = await verifier.connect();
    try {
      const socket = connection.connection.stream;
      const url = new URL(databaseUrl!);
      const identity = await connection.query('SELECT current_database() AS name');
      if (!(socket instanceof Socket) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress ?? '')
          || socket.remotePort !== Number(url.port || '5432') || identity.rows[0].name !== url.pathname.slice(1)) {
        throw new Error('Email linking test database identity mismatch.');
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

async function counts(database: Pool): Promise<Record<string, number>> {
  return (await database.query(`SELECT
    (SELECT count(*)::int FROM sign_in_email_identities) AS identities,
    (SELECT count(*)::int FROM audit_log) AS audits,
    (SELECT count(*)::int FROM refresh_tokens) AS sessions`)).rows[0];
}

it('email linking rejects privileged roles and malformed proof requests before database access', async () => {
  const transaction = jest.spyOn(db, 'transaction');
  try {
    for (const role of ['admin', 'super_admin', 'dpo']) {
      await expect(beginEmailLink({ ...actor, role } as EmailLinkActor, email, ip)).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(beginEmailLink(actor, 'not-an-email', ip)).rejects.toMatchObject({ statusCode: 400 });
    await expect(beginEmailLink(actor, email, 'not-an-ip')).rejects.toMatchObject({ statusCode: 400 });
    await expect(completeEmailLink(actor, crypto.randomUUID(), 'bad', '123456')).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction).not.toHaveBeenCalled();
  } finally { transaction.mockRestore(); }
});

for (const role of ['customer', 'provider', 'provider_staff'] as const) {
  sqlIt(`verified email links to its ${role} owner without changing contact email, role or sessions`, async () => {
    await withDatabase(async database => {
      const owner = { ...actor, role };
      const before = (await database.query('SELECT * FROM users WHERE id=$1', [sessionOwner])).rows[0];
      const proof = await beginEmailLink(owner, email, ip);
      const pending = (await database.query('SELECT * FROM email_link_challenges')).rows[0];
      expect(pending.state).toBe('pending');
      expect(pending.phone_code_hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
      expect(pending.email_code_hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
      expect(pending.phone_code_hash).not.toBe(pending.email_code_hash);
      expect(proof.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(await submit(proof, owner)).toEqual({ status: 'linked', email });
      expect(await counts(database)).toEqual({ identities: 1, audits: 1, sessions: 1 });
      expect((await database.query('SELECT * FROM users WHERE id=$1', [sessionOwner])).rows[0]).toEqual(before);
      expect((await database.query('SELECT * FROM email_link_challenges')).rows[0]).toMatchObject({
        state: 'completed', phone_code_hash: null, email_code_hash: null,
      });
      expect((await database.query('SELECT new_values FROM audit_log')).rows[0].new_values).toEqual({ method: 'email', proofId: proof.id });
      expect(await submit(proof, owner)).toEqual({ status: 'linked', email });
      expect(await counts(database)).toEqual({ identities: 1, audits: 1, sessions: 1 });
    }, role);
  });
}

sqlIt('email linking counts incorrect factors durably and locks the operation after three attempts', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    const wrong = proof.emailCode === '999999' ? '999998' : '999999';
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(await completeEmailLink(actor, proof.id, proof.phoneCode, wrong)).toEqual({ status: 'invalid' });
      expect((await database.query('SELECT attempts FROM email_link_challenges')).rows[0].attempts).toBe(attempt);
    }
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
    expect((await database.query('SELECT * FROM email_link_challenges')).rows[0]).toMatchObject({
      state: 'invalidated', phone_code_hash: null, email_code_hash: null,
    });
  });
}, 15000);

let cleanupPhoneSequence = 1;
async function seedCleanupRequests(database: Pool, count: number, state: 'pending' | 'invalidated', ageSeconds: number): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 0; n < count; n++) {
    const owner = crypto.randomUUID(), id = crypto.randomUUID();
    const phone = `+63919${String(cleanupPhoneSequence++).padStart(7, '0')}`;
    await database.query('INSERT INTO users (id,role,phone) VALUES ($1,\'customer\',$2)', [owner, phone]);
    await database.query(`INSERT INTO email_link_challenges
      (id,user_id,purpose,role,session_version,phone,email,email_key,request_ip,
       phone_code_hash,email_code_hash,max_attempts,state,created_at,expires_at,finished_at)
      SELECT $1,$2,'link_email','customer',1,$3,$4,$4,'192.0.2.1',
        CASE WHEN $5='pending' THEN 'synthetic-expired-hash' END,
        CASE WHEN $5='pending' THEN 'synthetic-expired-hash' END,
        3,$5,t.created,t.created+INTERVAL '5 minutes',
        CASE WHEN $5='invalidated' THEN t.created+INTERVAL '1 minute' END
      FROM (SELECT clock_timestamp()-($6 * INTERVAL '1 second') AS created) t`,
    [id, owner, phone, `${owner}@example.invalid`, state, ageSeconds]);
    ids.push(id);
  }
  return ids;
}

it('email-link cleanup rejects unbounded or malformed limits before querying any records', async () => {
  const transaction = jest.spyOn(db, 'transaction');
  try {
    for (const limit of [0, -1, 501, 1.5, NaN, Infinity]) {
      await expect(cleanupEmailLinkChallenges(limit)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(transaction).not.toHaveBeenCalled();
  } finally { transaction.mockRestore(); }
});

sqlIt('cleanup clears expired secrets, retains current requests and removes only old request metadata, never identities or audits', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await submit(proof);
    await database.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '91 days',
      expires_at=clock_timestamp()-INTERVAL '91 days'+INTERVAL '5 minutes' WHERE id=$1`, [proof.id]);
    const [expired] = await seedCleanupRequests(database, 1, 'pending', 3600);
    const [active] = await seedCleanupRequests(database, 1, 'pending', 0);
    const [recent] = await seedCleanupRequests(database, 1, 'invalidated', 89 * 86400);
    const before = await counts(database);
    const users = (await database.query('SELECT * FROM users ORDER BY id')).rows;
    expect(await cleanupEmailLinkChallenges()).toEqual({ proofsExpired: 1, requestsPurged: 1 });
    expect((await database.query('SELECT state,phone_code_hash,email_code_hash FROM email_link_challenges WHERE id=$1', [expired])).rows)
      .toEqual([{ state: 'invalidated', phone_code_hash: null, email_code_hash: null }]);
    expect((await database.query('SELECT state,phone_code_hash FROM email_link_challenges WHERE id=$1', [active])).rows)
      .toEqual([{ state: 'pending', phone_code_hash: 'synthetic-expired-hash' }]);
    expect((await database.query('SELECT id FROM email_link_challenges WHERE id=$1', [recent])).rowCount).toBe(1);
    expect((await database.query('SELECT id FROM email_link_challenges WHERE id=$1', [proof.id])).rowCount).toBe(0);
    expect(await counts(database)).toEqual(before);
    expect((await database.query('SELECT * FROM users ORDER BY id')).rows).toEqual(users);
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    expect(await cleanupEmailLinkChallenges()).toEqual({ proofsExpired: 0, requestsPurged: 0 });
  });
});

sqlIt('bounded concurrent cleanup skips real locked requests without duplicate actions and completes after release', async () => {
  await withDatabase(async database => {
    const expired = await seedCleanupRequests(database, 4, 'pending', 3600);
    const old = await seedCleanupRequests(database, 4, 'invalidated', 91 * 86400);
    const blocker = await database.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM email_link_challenges WHERE id=ANY($1::uuid[]) FOR UPDATE', [[expired[0], old[0]]]);
      const results = await Promise.all([cleanupEmailLinkChallenges(2), cleanupEmailLinkChallenges(2)]);
      expect(results.every(result => result.proofsExpired <= 2 && result.requestsPurged <= 2)).toBe(true);
      expect(results.reduce((sum, row) => sum + row.proofsExpired, 0)).toBe(3);
      expect(results.reduce((sum, row) => sum + row.requestsPurged, 0)).toBe(3);
      expect((await database.query('SELECT state FROM email_link_challenges WHERE id=$1', [expired[0]])).rows[0].state).toBe('pending');
      expect((await database.query('SELECT id FROM email_link_challenges WHERE id=$1', [old[0]])).rowCount).toBe(1);
      await blocker.query('COMMIT');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    expect(await cleanupEmailLinkChallenges(2)).toEqual({ proofsExpired: 1, requestsPurged: 1 });
    expect(await cleanupEmailLinkChallenges(2)).toEqual({ proofsExpired: 0, requestsPurged: 0 });
  });
});

sqlIt('a real retention-delete failure rolls back secret clearing and the complete batch can retry', async () => {
  await withDatabase(async database => {
    const [expired] = await seedCleanupRequests(database, 1, 'pending', 3600);
    await seedCleanupRequests(database, 1, 'invalidated', 91 * 86400);
    await database.query(`CREATE FUNCTION reject_request_purge() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic cleanup failure'; END; $$;
      CREATE TRIGGER reject_request_purge BEFORE DELETE ON email_link_challenges FOR EACH ROW EXECUTE FUNCTION reject_request_purge()`);
    await expect(cleanupEmailLinkChallenges()).rejects.toThrow('Synthetic cleanup failure');
    expect((await database.query('SELECT state,phone_code_hash FROM email_link_challenges WHERE id=$1', [expired])).rows)
      .toEqual([{ state: 'pending', phone_code_hash: 'synthetic-expired-hash' }]);
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(2);
    await database.query('DROP TRIGGER reject_request_purge ON email_link_challenges');
    expect(await cleanupEmailLinkChallenges()).toEqual({ proofsExpired: 1, requestsPurged: 1 });
  });
});

sqlIt('cleanup preserves recent abuse counters while removing abandoned expired requests older than the retention window', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await database.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '2 minutes',
      expires_at=clock_timestamp()+INTERVAL '3 minutes' WHERE id=$1`, [proof.id]);
    for (let n = 0; n < 4; n++) {
      await database.query(`INSERT INTO email_link_challenges
        (id,user_id,purpose,role,session_version,phone,email,email_key,request_ip,max_attempts,
         state,created_at,expires_at,finished_at)
        SELECT $1,user_id,purpose,role,session_version,phone,email,email_key,request_ip,max_attempts,
          'invalidated',created_at,expires_at,clock_timestamp() FROM email_link_challenges WHERE id=$2`, [crypto.randomUUID(), proof.id]);
    }
    await seedCleanupRequests(database, 1, 'pending', 91 * 86400);
    expect(await cleanupEmailLinkChallenges()).toEqual({ proofsExpired: 1, requestsPurged: 1 });
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(5);
    await expect(beginEmailLink(actor, 'Changed@example.invalid', '192.0.2.9')).rejects.toMatchObject({ statusCode: 429 });
    expect(await submit(proof)).toEqual({ status: 'linked', email });
  });
});

sqlIt('an old login or substituted account, generation, phone, recipient or factor hash cannot authorize linking', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    const stored = (await database.query('SELECT * FROM email_link_challenges')).rows[0];
    await database.query(`UPDATE email_link_challenges SET phone_code_hash=email_code_hash, email_code_hash=phone_code_hash`);
    expect(await completeEmailLink(actor, proof.id, proof.emailCode, proof.phoneCode)).toEqual({ status: 'invalid' });
    await database.query(`UPDATE email_link_challenges SET phone_code_hash=$1,email_code_hash=$2,
      email='Other@example.invalid', email_key='other@example.invalid'`, [stored.phone_code_hash, stored.email_code_hash]);
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    await database.query(`UPDATE email_link_challenges SET email=$1,email_key=lower($1)`, [email]);
    await database.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
    await expect(submit(proof)).rejects.toMatchObject({ statusCode: 401 });
    expect(await submit(proof, { ...actor, sessionVersion: 2 })).toEqual({ status: 'invalid' });
    expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
  });
}, 15000);

sqlIt('a different active account cannot consume another owner operation or overwrite legacy contact ownership', async () => {
  await withDatabase(async database => {
    const other: EmailLinkActor = { ...actor, userId: crypto.randomUUID() };
    await database.query(`INSERT INTO users (id,role,phone,email) VALUES ($1,'customer','+639180000000',$2)`, [other.userId, email]);
    const proof = await beginEmailLink(actor, email, ip);
    expect(await submit(proof, other)).toEqual({ status: 'invalid' });
    expect((await database.query('SELECT attempts FROM email_link_challenges')).rows[0].attempts).toBe(0);
    expect(await submit(proof)).toEqual({ status: 'linked', email });
    expect((await database.query('SELECT email FROM users WHERE id=$1', [other.userId])).rows[0].email).toBe(email);
    expect((await database.query('SELECT user_id FROM sign_in_email_identities')).rows[0].user_id).toBe(sessionOwner);
  });
});

sqlIt('concurrent same-operation completion and competing case-variant ownership have one identity and one audit', async () => {
  await withDatabase(async database => {
    const other: EmailLinkActor = { ...actor, userId: crypto.randomUUID() };
    await database.query(`INSERT INTO users (id,role,phone) VALUES ($1,'customer','+639180000000')`, [other.userId]);
    const first = await beginEmailLink(actor, email, ip);
    const second = await beginEmailLink(other, email.toLowerCase(), '192.0.2.2');
    const results = await Promise.all([submit(first), submit(first), submit(second, other)]);
    expect(results.some(result => result.status === 'linked')).toBe(true);
    expect(results.some(result => result.status === 'conflict')).toBe(true);
    expect(await counts(database)).toEqual({ identities: 1, audits: 1, sessions: 1 });
    const winner = (await database.query('SELECT * FROM sign_in_email_identities')).rows[0];
    expect(winner.email).toBe(winner.user_id === sessionOwner ? email : email.toLowerCase());
    const winningProof = winner.user_id === sessionOwner ? first : second;
    expect(await submit(winningProof, winner.user_id === sessionOwner ? actor : other)).toEqual({ status: 'linked', email: winner.email });
  });
}, 15000);

sqlIt('an audit insert failure rolls back identity and proof consumption and permits the same proof retry', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await database.query(`CREATE FUNCTION reject_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END; $$;
      CREATE TRIGGER reject_link_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_link_audit()`);
    await expect(submit(proof)).rejects.toThrow('Synthetic audit failure');
    expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
    expect((await database.query('SELECT state FROM email_link_challenges')).rows[0].state).toBe('pending');
    await database.query('DROP TRIGGER reject_link_audit ON audit_log');
    expect(await submit(proof)).toEqual({ status: 'linked', email });
    expect(await counts(database)).toEqual({ identities: 1, audits: 1, sessions: 1 });
  });
}, 15000);

sqlIt('expired or phone-changed operations cannot link and a revoked session cannot start a fresh operation', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await database.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '10 minutes',
      expires_at=clock_timestamp()-INTERVAL '5 minutes'`);
    expect(await submit(proof)).toEqual({ status: 'invalid' });
    const next = await beginEmailLink(actor, email, ip);
    await database.query(`UPDATE users SET phone='+639190000000' WHERE id=$1`, [sessionOwner]);
    expect(await submit(next)).toEqual({ status: 'invalid' });
    await database.query('UPDATE users SET is_active=FALSE WHERE id=$1', [sessionOwner]);
    await expect(beginEmailLink(actor, email, ip)).rejects.toMatchObject({ statusCode: 401 });
    expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
  });
});

sqlIt('concurrent begins enforce account cooldown without issuing two pending operations', async () => {
  await withDatabase(async database => {
    const results = await Promise.allSettled([beginEmailLink(actor, email, ip), beginEmailLink(actor, 'Other@example.invalid', ip)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 429 } });
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(1);
  });
});

sqlIt('actual account lock waits recheck revocation and server expiry before linking', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [sessionOwner]);
      pending = submit(proof).catch(error => error);
      await waitForBlockedApproval(database, pid);
      await blocker.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
      await blocker.query('COMMIT');
      expect(await pending).toMatchObject({ statusCode: 401 });
      await database.query('UPDATE users SET session_version=1 WHERE id=$1', [sessionOwner]);
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [sessionOwner]);
      pending = submit(proof);
      await waitForBlockedApproval(database, pid);
      await blocker.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '10 minutes',
        expires_at=clock_timestamp()-INTERVAL '5 minutes' WHERE id=$1`, [proof.id]);
      await blocker.query('COMMIT');
      expect(await pending).toEqual({ status: 'invalid' });
      expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (pending) await pending;
    }
  });
}, 15000);

sqlIt('proof expiring during a real unique-key wait does not commit ownership or an audit', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await database.query(`UPDATE email_link_challenges SET created_at=clock_timestamp()-INTERVAL '4 minutes',
      expires_at=clock_timestamp()+INTERVAL '5 seconds' WHERE id=$1`, [proof.id]);
    const other = crypto.randomUUID();
    await database.query(`INSERT INTO users (id,role,phone) VALUES ($1,'customer','+639180000000')`, [other]);
    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query(`INSERT INTO sign_in_email_identities (user_id,email,email_key,proof_id)
        VALUES ($1,$2,lower($2),$3)`, [other, email, crypto.randomUUID()]);
      pending = submit(proof);
      await waitForBlockedApproval(database, pid);
      // Wait for actual database clock expiry, while observing the real lock.
      await blocker.query(`SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM
        (SELECT expires_at FROM email_link_challenges WHERE id=$1) - clock_timestamp())) + 0.05)`, [proof.id]);
      await blocker.query('ROLLBACK');
      expect(await pending).toEqual({ status: 'invalid' });
      expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (pending) await pending;
    }
  });
}, 15000);

sqlIt('hard hourly account, recipient and canonical IP limits survive changed request identifiers', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, '2001:0db8:0:0:0:0:0:1');
    const seed = (await database.query('SELECT * FROM email_link_challenges WHERE id=$1', [proof.id])).rows[0];
    expect(seed.request_ip).toBe('2001:db8::1');
    await database.query(`UPDATE email_link_challenges SET state='invalidated',phone_code_hash=NULL,email_code_hash=NULL,
      finished_at=clock_timestamp(),created_at=clock_timestamp()-INTERVAL '2 minutes',
      expires_at=clock_timestamp()+INTERVAL '3 minutes'`);
    for (let n = 0; n < 4; n++) {
      await database.query(`INSERT INTO email_link_challenges
        (id,user_id,purpose,role,session_version,phone,email,email_key,request_ip,
          max_attempts,state,created_at,expires_at,finished_at)
        SELECT $1,user_id,purpose,role,session_version,phone,email,email_key,request_ip,
          max_attempts,state,created_at,expires_at,finished_at FROM email_link_challenges WHERE id=$2`,
      [crypto.randomUUID(), proof.id]);
    }
    await expect(beginEmailLink(actor, 'Changed@example.invalid', '192.0.2.9')).rejects.toMatchObject({ statusCode: 429 });
    const other: EmailLinkActor = { ...actor, userId: crypto.randomUUID() };
    await database.query(`INSERT INTO users (id,role,phone) VALUES ($1,'customer','+639180000000')`, [other.userId]);
    await expect(beginEmailLink(other, email.toLowerCase(), '192.0.2.10')).rejects.toMatchObject({ statusCode: 429 });
    await expect(beginEmailLink(other, 'Changed@example.invalid', '2001:db8::1')).rejects.toMatchObject({ statusCode: 429 });
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(5);
    expect(await counts(database)).toEqual({ identities: 0, audits: 0, sessions: 1 });
  });
});

sqlIt('identity export includes only the requested owner email and verification date, not proof secrets', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await submit(proof);
    const other = crypto.randomUUID();
    await database.query(`INSERT INTO users (id,role,phone) VALUES ($1,'customer','+639180000000')`, [other]);
    await database.query(`INSERT INTO sign_in_email_identities (user_id,email,email_key,proof_id)
      VALUES ($1,'Other@example.invalid','other@example.invalid',$2)`, [other, crypto.randomUUID()]);
    // The new export query runs against PostgreSQL. Unrelated export tables
    // are out of this focused fixture, not claims of full archive acceptance.
    const original = db.query;
    db.query = async (sql, params) => sql.includes('FROM sign_in_email_identities') || sql.includes('FROM email_link_challenges')
      ? original(sql, params) : { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    try {
      const exported = await gatherUserData(sessionOwner);
      expect(exported.signInEmails).toEqual([{ email, verified_at: expect.any(Date) }]);
      expect(exported.emailLinkRequests).toEqual([{
        phone: proof.phone, email, state: 'completed', request_ip: ip,
        created_at: expect.any(Date), expires_at: expect.any(Date), finished_at: expect.any(Date),
      }]);
      expect((await gatherUserData(other)).signInEmails).toEqual([{ email: 'Other@example.invalid', verified_at: expect.any(Date) }]);
      expect((await gatherUserData(other)).emailLinkRequests).toEqual([]);
      const serialized = JSON.stringify(exported);
      for (const secret of [proof.phoneCode, proof.emailCode, proof.id, 'phone_code_hash', 'email_code_hash', 'Other@example.invalid']) {
        expect(serialized).not.toContain(JSON.stringify(secret));
      }
    } finally { db.query = original; }
  });
});

sqlIt('soft anonymization erases sign-in addresses and proofs with session revocation and rolls back on failure', async () => {
  await withDatabase(async database => {
    const proof = await beginEmailLink(actor, email, ip);
    await submit(proof);
    await seedDeletion(database);
    await database.query(`CREATE FUNCTION reject_link_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic erasure failure'; END; $$;
      CREATE TRIGGER reject_link_erasure BEFORE DELETE ON sign_in_email_identities FOR EACH ROW EXECUTE FUNCTION reject_link_erasure()`);
    expect(await processExpiredCoolingOff()).toBe(0);
    expect(await counts(database)).toEqual({ identities: 1, audits: 1, sessions: 1 });
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(1);
    expect((await database.query('SELECT is_active FROM users WHERE id=$1', [sessionOwner])).rows[0].is_active).toBe(true);
    await database.query('DROP TRIGGER reject_link_erasure ON sign_in_email_identities');
    expect(await processExpiredCoolingOff()).toBe(1);
    expect(await counts(database)).toEqual({ identities: 0, audits: 1, sessions: 0 });
    expect((await database.query('SELECT count(*)::int AS count FROM email_link_challenges')).rows[0].count).toBe(0);
    await expect(submit(proof)).rejects.toMatchObject({ statusCode: 401 });
  });
}, 15000);
