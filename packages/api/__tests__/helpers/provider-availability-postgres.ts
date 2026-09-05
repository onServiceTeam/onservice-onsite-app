import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { pool } from '../../src/config/database.config';

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const url = new URL(databaseUrl);
    return ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.slice(1).endsWith('_test');
  } catch { return false; }
})();
if (process.env.CI && !safeDatabase) throw new Error('Availability integration tests require isolated localhost *_test PostgreSQL in CI.');
export const availabilityIntegrationIt = safeDatabase ? it : it.skip;
export const providerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const otherProviderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const categoryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const subcategoryId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// Real SQL, transactions and migration-043 override constraints. Other tables
// are a focused fixture, not a full migration/launch rehearsal.
export async function withAvailabilityDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe availability test database.');
  const schema = `availability_${randomUUID().replaceAll('-', '')}`;
  const database = new Pool({ connectionString: databaseUrl, max: 6, connectionTimeoutMillis: 5000,
    application_name: schema, options: `-c search_path=${schema} -c statement_timeout=8000 -c lock_timeout=6000` });
  const original = { query: pool.query, connect: pool.connect };
  let created = false;
  try {
    await database.query(`CREATE SCHEMA "${schema}"`); created = true;
    await database.query(`
      CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE SQL AS $$ SELECT gen_random_uuid() $$;
      CREATE TABLE providers (
        id uuid PRIMARY KEY, user_id uuid NOT NULL, business_name text NOT NULL,
        tier text NOT NULL DEFAULT 'new', status text NOT NULL DEFAULT 'approved',
        is_available boolean NOT NULL DEFAULT TRUE, rating numeric NOT NULL DEFAULT 5,
        total_jobs integer NOT NULL DEFAULT 0, total_reviews integer NOT NULL DEFAULT 0,
        service_radius_km integer NOT NULL DEFAULT 20, latitude numeric DEFAULT 10.3, longitude numeric DEFAULT 123.9,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE provider_services (provider_id uuid REFERENCES providers(id), category_id uuid,
        subcategory_id uuid, is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE provider_availability (id uuid DEFAULT gen_random_uuid(), provider_id uuid REFERENCES providers(id),
        day_of_week integer, start_time time, end_time time, is_available boolean DEFAULT TRUE,
        created_at timestamptz DEFAULT NOW());
      CREATE TABLE booking_offers (provider_id uuid, status text);
      CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id uuid,
        status text, scheduled_at timestamptz, total_amount integer);
    `);
    await database.query(readFileSync(resolve(__dirname, '../../migrations/043_availability_overrides.sql'), 'utf8'));
    await database.query(`INSERT INTO providers (id,user_id,business_name) VALUES
      ($1,$1,'Synthetic provider'),($2,$2,'Synthetic other provider')`, [providerId, otherProviderId]);
    await database.query(`INSERT INTO provider_services (provider_id,category_id,subcategory_id)
      VALUES ($1,$2,$3)`, [providerId, categoryId, subcategoryId]);
    Object.assign(pool, { query: database.query.bind(database), connect: database.connect.bind(database) });
    await run(database);
  } finally {
    Object.assign(pool, original);
    try { if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await database.end(); }
  }
}

export async function waitForAvailabilityWriters(database: Pool, blockerPid: number, count: number): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    // A second writer may queue behind the first tuple waiter, rather than
    // listing the original barrier directly. Observe the full waiting set.
    const result = await database.query<{ count: number; barrier: boolean }>(`SELECT count(*)::int AS count,
      bool_or($1::int=ANY(pg_blocking_pids(pid))) AS barrier FROM pg_stat_activity
      WHERE application_name=current_setting('application_name') AND cardinality(pg_blocking_pids(pid)) > 0`, [blockerPid]);
    if ((result.rows[0]?.count ?? 0) >= count && result.rows[0]?.barrier) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Availability writers did not wait on the real provider lock.');
}
