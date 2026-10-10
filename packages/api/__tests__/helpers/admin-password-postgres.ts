import crypto from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';
import { pool } from '../../src/config/database.config';
import { db } from '../../src/models/db';
import { SCRYPT_KEYLEN, SCRYPT_R, SCRYPT_P, SCRYPT_MAXMEM } from '../../src/services/auth.service';

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const url = new URL(databaseUrl);
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      && url.pathname.replace(/^\//, '').endsWith('_test');
  } catch { return false; }
})();
if (process.env.CI && !safeDatabase) {
  throw new Error('Admin password integration tests require the isolated localhost *_test PostgreSQL service in CI.');
}
export const passwordIntegrationIt = safeDatabase ? it : it.skip;
export const passwordOwner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const passwordEmail = 'synthetic-password-owner@example.invalid';
export const oldPassword = 'synthetic-original-password-1234';
export const newPassword = 'synthetic-replacement-password-5678';

export function originalHash(format: 'legacy' | 'weaker' = 'legacy'): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(oldPassword, salt, SCRYPT_KEYLEN, {
    N: 16384, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  }).toString('hex');
  return format === 'legacy' ? `${salt}:${hash}` : `scrypt:16384:${SCRYPT_R}:${SCRYPT_P}:${salt}:${hash}`;
}

// Real queries/transactions in a test-owned schema. This focused auth fixture
// is not a full migration-chain or production-data preservation rehearsal.
export async function withPasswordDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe admin password test database.');
  const schema = `admin_password_${crypto.randomUUID().replaceAll('-', '')}`;
  const database = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5000,
    application_name: schema,
    options: `-c search_path=${schema} -c statement_timeout=15000 -c lock_timeout=12000`,
  });
  const original = { query: pool.query, connect: pool.connect };
  let created = false;
  try {
    await database.query(`CREATE SCHEMA "${schema}"`); created = true;
    await database.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL, email text UNIQUE,
        phone text DEFAULT '+639170000000', first_name text DEFAULT 'Synthetic', last_name text DEFAULT 'Operator',
        avatar_url text, is_verified boolean DEFAULT TRUE, is_active boolean DEFAULT TRUE,
        password_hash text, session_version integer NOT NULL DEFAULT 1,
        must_rotate_password boolean NOT NULL DEFAULT TRUE,
        totp_enabled boolean NOT NULL DEFAULT TRUE, totp_secret text DEFAULT 'unused-synthetic-factor',
        last_login_at timestamptz, created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW());
      CREATE TABLE refresh_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id), token_hash text UNIQUE, expires_at timestamptz,
        device_fingerprint text, created_ip inet, created_at timestamptz DEFAULT NOW());
      CREATE TABLE admin_csrf_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id uuid REFERENCES users(id), token text UNIQUE, ip_address inet,
        user_agent text, expires_at timestamptz, revoked_at timestamptz);
      CREATE TABLE admin_actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid REFERENCES users(id), action_type text, target_type text,
        target_id uuid, details jsonb, reason text);
      CREATE TABLE login_attempts (phone text, attempt_type text, success boolean,
        created_at timestamptz DEFAULT NOW());
    `);
    Object.assign(pool, { query: database.query.bind(database), connect: database.connect.bind(database) });
    await run(database);
  } finally {
    Object.assign(pool, original);
    try { if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await database.end(); }
  }
}

export async function seedPasswordOwner(database: Pool, hash: string, role = 'admin'): Promise<void> {
  await database.query('INSERT INTO users (id,email,role,password_hash) VALUES ($1,$2,$3,$4)',
    [passwordOwner, passwordEmail, role, hash]);
}

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 8000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

// Instrument scheduling only: the original transaction, row lock, every SQL
// statement, commit and rollback still execute in PostgreSQL.
export function pauseLockedPasswordRead(): { entered: Promise<void>; release: () => void; restore: () => void } {
  const actual = db.transaction, entered = deferred(), release = deferred();
  let paused = false;
  db.transaction = async work => actual(async client => work({
    query: async <R extends QueryResultRow>(sql: string, params?: unknown[]) => {
      const result = await client.query<R>(sql, params);
      if (!paused && sql.includes('password_hash') && sql.includes('FOR UPDATE')) {
        paused = true; entered.resolve(); await release.promise;
      }
      return result;
    },
  }));
  return { entered: entered.promise, release: release.resolve, restore: () => { db.transaction = actual; } };
}

export async function waitForBlockedRehash(database: Pool): Promise<void> {
  const name = (await database.query("SELECT current_setting('application_name') AS name")).rows[0].name;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await database.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock'
        AND query LIKE 'UPDATE users%' AND position('password_hash' in query)>0`, [name]);
    if (result.rows[0].count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('The real rehash UPDATE did not wait on the password transaction row lock.');
}
