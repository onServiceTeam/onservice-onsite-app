import { randomUUID } from 'node:crypto';
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
  throw new Error('Provider approval integration tests require the isolated localhost *_test PostgreSQL service in CI.');
}
export const approvalIntegrationIt = safeDatabase ? it : it.skip;
export const approvalReview = {
  reason: 'Identity and qualifications were reviewed against the application.',
  checklistConfirmed: true,
  checklistSummary: 'Both ID sides, NBI, selfie, references and service qualifications reviewed.',
};

// Real admin.service + real db.transaction, with only the configured pool
// pointed at an isolated schema. No production database/schema is accepted.
export async function withApprovalDatabase(
  run: (database: Pool) => Promise<void>,
): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe approval test database.');
  const schema = `approval_${randomUUID().replaceAll('-', '')}`;
  const database = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    max: 5,
    application_name: schema,
    options: `-c search_path=${schema} -c statement_timeout=8000 -c lock_timeout=6000`,
  });
  const original = { query: pool.query, connect: pool.connect };
  let created = false;
  try {
    await database.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await database.query(`
      CREATE TABLE users (
        id text PRIMARY KEY, role text NOT NULL, is_active boolean NOT NULL DEFAULT TRUE,
        is_flagged_fraud boolean NOT NULL DEFAULT FALSE, updated_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE providers (
        id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), status text NOT NULL,
        nbi_clearance_url text, government_id_front_url text, government_id_back_url text,
        selfie_url text, reviewed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE admin_actions (
        id serial PRIMARY KEY, admin_id text NOT NULL REFERENCES users(id), action_type text,
        target_type text, target_id text, details jsonb, reason text, full_notes text
      );
      CREATE TABLE notifications (
        id serial PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), type text,
        title text, body text, data jsonb
      );
      INSERT INTO users (id,role) VALUES ('owner','customer'), ('operator','admin');
      INSERT INTO providers (id,user_id,status,nbi_clearance_url,government_id_front_url,government_id_back_url,selfie_url)
      VALUES ('application','owner','pending','onboarding/owner/nbi','onboarding/owner/front','onboarding/owner/back','onboarding/owner/selfie');
    `);
    Object.assign(pool, {
      query: database.query.bind(database),
      connect: database.connect.bind(database),
    });
    await run(database);
  } finally {
    Object.assign(pool, original);
    try {
      if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await database.end(); }
  }
}

export async function assertNoApproval(database: Pool): Promise<void> {
  expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows).toEqual([{ count: 0 }]);
  expect((await database.query('SELECT count(*)::int AS count FROM notifications')).rows).toEqual([{ count: 0 }]);
  expect((await database.query("SELECT status, reviewed_at FROM providers WHERE id='application'")).rows)
    .toEqual([{ status: 'pending', reviewed_at: null }]);
}

export async function waitForBlockedApproval(database: Pool, blockerPid: number): Promise<void> {
  // Observe the actual database lock dependency, not a guessed sleep duration.
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const waiting = await database.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE application_name = current_setting('application_name')
          AND $1::int = ANY(pg_blocking_pids(pid))) AS waiting`, [blockerPid],
    );
    if (waiting.rows[0]?.waiting) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Approval did not wait for the actual concurrent database lock.');
}
