// HA-M2 (customer human audit 2026-10-13, D38 Milestone 2) helpers: the
// request-first response engine on the guarded PostgreSQL fixture.
//
// Wraps Milestone 1's withJobRequestDatabase, adds the production shapes that
// migrations 183-185 reference, and then applies the REAL migration files with
// readFileSync (never a copy of their SQL):
//   - providers.business_name / is_available / rating / total_reviews /
//     total_jobs (002, renamed and extended by 013);
//   - conversations and messages from the real 006, 123 and 138 files;
//   - admin_actions with its production column types (014) and its action
//     CHECK in the stored per-element form ('verb'::character varying)::text
//     that the 138 and 184 splices extend;
//   - platform_settings with the production columns (050), the real 051 audit
//     table, and the 050 rows for quote_expiry_hours and
//     max_quotes_per_booking.
// This is a scoped fixture, not the complete migration chain. Push delivery
// stays off: the participant fixture's stored notification preferences
// disable device push, and it fails any network call.
//
// `through` picks the last D38 migration applied before the test body runs:
// 182 applies none (for migration tests that populate data first), 184 is the
// default, and 185 (request threads, owned by package P4) needs that file to
// exist.
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { withJobRequestDatabase, type JobRequestFixtureOptions } from './job-request-postgres';
import { providerA, providerB } from './booking-participant-postgres';

export type RequestEngineMigration = 183 | 184 | 185;

export const REQUEST_ENGINE_MIGRATION_FILES: Readonly<Record<RequestEngineMigration, string>> = {
  183: '183_request_first_response_engine.sql',
  184: '184_job_media.sql',
  185: '185_request_threads.sql',
};

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/** The 17 admin action names migration 014 created the constraint with. */
export const BASE_ADMIN_ACTION_TYPES = [
  'provider_approved', 'provider_suspended', 'provider_reactivated',
  'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
  'customer_suspended', 'customer_reactivated', 'customer_credited',
  'booking_cancelled', 'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
  'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued',
] as const;

/** The admin_actions action CHECK in the per-element form live stores (see 138). */
export function perElementActionCheck(actions: readonly string[]): string {
  const items = actions.map(action => `('${action}'::character varying)::text`).join(', ');
  return `CHECK (((action_type)::text = ANY (ARRAY[${items}])))`;
}

/** The same CHECK as a fresh IN list, which Postgres stores as (ARRAY[...])::text[]. */
export function inListActionCheck(actions: readonly string[]): string {
  return `CHECK (action_type IN (${actions.map(action => `'${action}'`).join(', ')}))`;
}

export function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
}

/**
 * Apply one real migration file as a single statement batch. Postgres runs a
 * multi-statement simple query in one implicit transaction, so a failure
 * leaves nothing behind, as run-reviewed-migrations.mjs (singleTransaction)
 * does in production.
 */
export async function applyRequestEngineMigration(
  database: Pool,
  migration: RequestEngineMigration,
): Promise<void> {
  await database.query(readMigration(REQUEST_ENGINE_MIGRATION_FILES[migration]));
}

/**
 * Every column of `table` in table order. With tableRows() this is the
 * before/after snapshot HA-M2-01 takes around 183 and 184, and the one the
 * 185 half of plan test 01 needs around 185 (see the HA-M2-01 header).
 */
export async function tableColumns(database: Pool, table: string): Promise<string[]> {
  const result = await database.query<{ column_name: string }>(`SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1
     ORDER BY ordinal_position`, [table]);
  return result.rows.map(row => row.column_name);
}

/** The named columns of every matching row of `table`, ordered by id. */
export async function tableRows(
  database: Pool,
  table: string,
  columns: readonly string[],
  where = 'TRUE',
): Promise<unknown[]> {
  const list = columns.map(column => `"${column}"`).join(', ');
  return (await database.query(`SELECT ${list} FROM ${table} WHERE ${where} ORDER BY id`)).rows;
}

/** Add or replace a platform_settings row with the production NOT NULL columns filled. */
export async function upsertPlatformSetting(database: Pool, key: string, value: string): Promise<void> {
  await database.query(`INSERT INTO platform_settings (category, key, label, value_type, value, default_value)
    VALUES ('fixture', $1::text, $1::text, 'string', $2::text, $2::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value]);
}

/** Production shapes the D38 migrations need, on top of the Milestone 1 fixture. */
export async function addRequestEngineBaseShapes(database: Pool): Promise<void> {
  // 006 defaults ids with uuid_generate_v4() (uuid-ossp). The fixture schema
  // has no extensions, so point it at gen_random_uuid(), as the base fixture
  // already does for uuidv7().
  await database.query(`
    CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
    ALTER TABLE providers
      ADD COLUMN business_name varchar(200) NOT NULL DEFAULT '',
      ADD COLUMN is_available boolean NOT NULL DEFAULT TRUE,
      ADD COLUMN rating numeric(3,2) NOT NULL DEFAULT 0.00,
      ADD COLUMN total_reviews integer NOT NULL DEFAULT 0,
      ADD COLUMN total_jobs integer NOT NULL DEFAULT 0;
  `);
  await database.query(`UPDATE providers SET business_name = CASE id
      WHEN $1::uuid THEN 'Synthetic Aircon Team A' WHEN $2::uuid THEN 'Synthetic Aircon Team B'
      ELSE 'Synthetic provider' END`, [providerA, providerB]);
  // business_name is NOT NULL with no default in production (002).
  await database.query('ALTER TABLE providers ALTER COLUMN business_name DROP DEFAULT');

  // admin_actions: production column types (014) and the stored per-element
  // CHECK form, so 138 and 184 splice the constraint exactly as on live.
  await database.query(`
    ALTER TABLE admin_actions
      DROP CONSTRAINT admin_actions_action_type_check,
      DROP CONSTRAINT admin_actions_target_type_check;
    ALTER TABLE admin_actions
      ALTER COLUMN action_type TYPE varchar(50),
      ALTER COLUMN target_type TYPE varchar(30);
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
      ${perElementActionCheck(BASE_ADMIN_ACTION_TYPES)};
    ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
      CHECK (target_type IN ('provider', 'customer', 'booking', 'dispute', 'payout', 'config'));
  `);

  // Chat tables from the real files: 006 creates them, 123 makes booking_id
  // unique, 138 adds moderation columns and splices three admin actions.
  for (const file of ['006_create_messages.sql', '123_phase29_conversations_booking_unique.sql', '138_chat_moderation.sql']) {
    await database.query(readMigration(file));
  }

  // platform_settings: the production columns from 050. The fixture keeps
  // `key` as its primary key; `id` is unique so 051's foreign key resolves.
  // Defaults are dropped after the existing fixture rows are filled, so a
  // migration that leaves out a NOT NULL column fails here as it would live.
  await database.query(`
    ALTER TABLE platform_settings
      ADD COLUMN id uuid NOT NULL DEFAULT uuidv7() UNIQUE,
      ADD COLUMN category varchar(50) NOT NULL DEFAULT 'fixture',
      ADD COLUMN subcategory varchar(50),
      ADD COLUMN label varchar(200) NOT NULL DEFAULT '',
      ADD COLUMN description text,
      ADD COLUMN value_type varchar(20) NOT NULL DEFAULT 'string'
        CHECK (value_type IN ('number','percent','currency','integer','boolean','string','json')),
      ADD COLUMN default_value text,
      ADD COLUMN min_value numeric(14,4),
      ADD COLUMN max_value numeric(14,4),
      ADD COLUMN allowed_values text[],
      ADD COLUMN display_order integer NOT NULL DEFAULT 0,
      ADD COLUMN unit varchar(20),
      ADD COLUMN is_sensitive boolean NOT NULL DEFAULT FALSE,
      ADD COLUMN requires_restart boolean NOT NULL DEFAULT FALSE,
      ADD COLUMN updated_by uuid REFERENCES users(id),
      ADD COLUMN created_at timestamptz NOT NULL DEFAULT NOW();
    UPDATE platform_settings SET label = key, default_value = value;
    ALTER TABLE platform_settings
      ALTER COLUMN default_value SET NOT NULL,
      ALTER COLUMN category DROP DEFAULT,
      ALTER COLUMN label DROP DEFAULT,
      ALTER COLUMN value_type DROP DEFAULT;
  `);
  await database.query(readMigration('051_platform_settings_audit.sql'));
  // The two quote rows exactly as migration 050 seeds them.
  await database.query(`INSERT INTO platform_settings
      (category, key, label, description, value_type, value, default_value, min_value, max_value, unit, display_order)
    VALUES
      ('provider', 'quote_expiry_hours', 'Quote Expiry', 'Hours before submitted quote expires','integer','48','48',12,168,'hours',4),
      ('provider', 'max_quotes_per_booking', 'Max Quotes/Booking', 'Maximum quotes per job','integer','5','5',1,20,'quotes',5)`);
}

export interface RequestEngineFixtureOptions extends JobRequestFixtureOptions {
  /** Last D38 migration applied before `run` (182 = none). Default 184. */
  through?: 182 | RequestEngineMigration;
}

export async function withRequestEngineDatabase(
  run: (database: Pool) => Promise<void>,
  options: RequestEngineFixtureOptions = {},
): Promise<void> {
  const { through = 184, ...jobRequestOptions } = options;
  await withJobRequestDatabase(async database => {
    await addRequestEngineBaseShapes(database);
    for (const migration of [183, 184, 185] as const) {
      if (migration <= through) await applyRequestEngineMigration(database, migration);
    }
    await run(database);
  }, jobRequestOptions);
}
