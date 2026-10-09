import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { pool } from '../../src/config/database.config';

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
  throw new Error('Application draft tests require the isolated localhost *_test PostgreSQL service in CI.');
}
export const draftIntegrationIt = safeDatabase ? it : it.skip;
export const draftOwner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const otherDraftOwner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Apply the ACTUAL additive migration to UUID account fixtures. This proves
// its constraints and service transactions, not the entire migration chain.
export async function withDraftDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe application draft test database.');
  const schema = `draft_${randomUUID().replaceAll('-', '')}`;
  const database = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 5000,
    application_name: schema,
    options: `-c search_path=${schema} -c statement_timeout=8000 -c lock_timeout=6000`,
  });
  const original = { query: pool.query, connect: pool.connect };
  let created = false;
  try {
    await database.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await database.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL,
        is_active boolean NOT NULL DEFAULT TRUE, is_flagged_fraud boolean NOT NULL DEFAULT FALSE,
        session_version integer NOT NULL DEFAULT 1, must_rotate_password boolean NOT NULL DEFAULT FALSE);
      CREATE TABLE providers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid UNIQUE NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'pending');
    `);
    await database.query(await readFile(path.resolve(__dirname, '../../migrations/172_provider_application_drafts.sql'), 'utf8'));
    await database.query("INSERT INTO users (id,role) VALUES ($1,'customer'),($2,'customer')", [draftOwner, otherDraftOwner]);
    Object.assign(pool, { query: database.query.bind(database), connect: database.connect.bind(database) });
    await run(database);
  } finally {
    Object.assign(pool, original);
    try { if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await database.end(); }
  }
}

export async function expireDraft(database: Pool, owner = draftOwner): Promise<void> {
  await database.query(`UPDATE provider_application_drafts SET
    created_at=NOW()-INTERVAL '32 days',saved_at=NOW()-INTERVAL '31 days',expires_at=NOW()-INTERVAL '1 day'
    WHERE user_id=$1`, [owner]);
}
