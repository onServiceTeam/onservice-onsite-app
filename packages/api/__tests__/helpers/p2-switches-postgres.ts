// CR (customer review 2026-10-17, build program slice P2; D41 Q32, Q33, Q39,
// Q47): guarded PostgreSQL fixture for the Service Provider profile privacy
// fix, the sign-in honesty fix, the invited-testers setting, the referral off
// switch and the Suki off switch.
//
// Real queries and transactions in a test-owned schema. The settings rows of
// this slice come from the REAL migration 188 (read from disk, never a copy),
// on a platform_settings table with the production columns of migration 050
// and the real 051 audit table. The other tables follow their production
// migrations (users 001, providers 002/013/029, wallets 005, notifications
// 009, referral and Suki tables 015, login_attempts 026, otp_codes 001/089),
// trimmed to the columns these paths read. This is a scoped fixture, not the
// complete migration chain. Mounted routers run behind the real
// authentication middleware with a synthetic signing secret.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Router } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Pool } from 'pg';
import { pool } from '../../src/config/database.config';
import { errorMiddleware } from '../../src/middleware/error.middleware';

const databaseUrl = process.env.DATABASE_URL;
const safeDatabase = (() => {
  if (!databaseUrl || process.env.NODE_ENV !== 'test') return false;
  try {
    const url = new URL(databaseUrl);
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && ['localhost', '127.0.0.1'].includes(url.hostname)
      && !url.search && !url.hash
      && decodeURIComponent(url.pathname.replace(/^\//, '')).endsWith('_test');
  } catch { return false; }
})();
if (process.env.CI && !safeDatabase) {
  throw new Error('P2 switch integration tests require the isolated localhost *_test PostgreSQL service in CI.');
}
export const p2It = safeDatabase ? it : it.skip;

export const p2Secret = 'p2-switches-synthetic-signing-secret-only';
export const customerUser = 'c2000000-0000-4000-8000-000000000001';
export const referrerUser = 'c2000000-0000-4000-8000-000000000002';
export const superAdminUser = 'c2000000-0000-4000-8000-000000000003';
export const approvedProviderUser = 'c2000000-0000-4000-8000-000000000011';
export const pendingProviderUser = 'c2000000-0000-4000-8000-000000000012';
export const rejectedProviderUser = 'c2000000-0000-4000-8000-000000000013';
export const suspendedProviderUser = 'c2000000-0000-4000-8000-000000000014';
export const deactivatedProviderUser = 'c2000000-0000-4000-8000-000000000015';
export const inactiveAccountProviderUser = 'c2000000-0000-4000-8000-000000000016';
export const approvedProvider = 'c3000000-0000-4000-8000-000000000011';
export const pendingProvider = 'c3000000-0000-4000-8000-000000000012';
export const rejectedProvider = 'c3000000-0000-4000-8000-000000000013';
export const suspendedProvider = 'c3000000-0000-4000-8000-000000000014';
export const deactivatedProvider = 'c3000000-0000-4000-8000-000000000015';
export const inactiveAccountProvider = 'c3000000-0000-4000-8000-000000000016';
export const catalogCategory = 'c4000000-0000-4000-8000-000000000001';
export const catalogService = 'c4000000-0000-4000-8000-000000000002';
/** Photo URL of the approved Service Provider (synthetic, never fetched). */
export const approvedAvatarUrl = 'https://uploads.example.invalid/avatars/ana-reyes.jpg';

export const MIGRATION_188 = '188_referral_suki_invited_testers_switches.sql';

export function readMigration(file: string): string {
  return fs.readFileSync(path.join(__dirname, '../../migrations', file), 'utf8');
}

export interface P2FixtureOptions {
  /** Apply migration 188 before the test body (default true). */
  migration188?: boolean;
}

export async function withP2Database(
  run: (database: Pool) => Promise<void>,
  options: P2FixtureOptions = {},
): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe P2 switch test database.');
  const schema = `p2_switches_${crypto.randomUUID().replaceAll('-', '')}`;
  const database = new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 5000,
    application_name: schema,
    options: `-c search_path=${schema} -c statement_timeout=15000 -c lock_timeout=12000`,
  });
  const original = { query: pool.query, connect: pool.connect };
  const originalSecret = process.env.JWT_SECRET;
  let created = false;
  try {
    await database.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await database.query(`
      CREATE FUNCTION uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone varchar(15) UNIQUE,
        email varchar(255) UNIQUE,
        first_name varchar(100) NOT NULL DEFAULT '',
        last_name varchar(100) NOT NULL DEFAULT '',
        role varchar(20) NOT NULL DEFAULT 'customer',
        avatar_url text,
        is_verified boolean NOT NULL DEFAULT FALSE,
        is_active boolean NOT NULL DEFAULT TRUE,
        session_version integer NOT NULL DEFAULT 1,
        must_rotate_password boolean NOT NULL DEFAULT FALSE,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE providers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        business_name varchar(200) NOT NULL,
        description text NOT NULL DEFAULT '',
        tier varchar(20) NOT NULL DEFAULT 'new'
          CHECK (tier IN ('founding', 'new', 'verified', 'pro', 'elite')),
        status varchar(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'deactivated')),
        bio text,
        rating numeric(3,2) NOT NULL DEFAULT 0.00,
        total_reviews integer NOT NULL DEFAULT 0,
        total_jobs integer NOT NULL DEFAULT 0,
        acceptance_rate numeric(5,2) NOT NULL DEFAULT 0.00,
        response_time_minutes integer,
        years_experience integer,
        service_radius_km integer NOT NULL DEFAULT 10,
        is_available boolean NOT NULL DEFAULT TRUE,
        latitude numeric(10,8),
        longitude numeric(11,8),
        city varchar(100),
        province varchar(100),
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE service_categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL,
        slug varchar(100) NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE service_subcategories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id uuid NOT NULL REFERENCES service_categories(id),
        name varchar(100) NOT NULL, slug varchar(100) NOT NULL, description text NOT NULL DEFAULT '',
        pricing_type varchar(20) NOT NULL DEFAULT 'fixed', base_price bigint, min_price bigint, max_price bigint,
        hourly_rate bigint, unit_label varchar(30), unit_price bigint,
        display_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE provider_services (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        category_id uuid NOT NULL REFERENCES service_categories(id),
        subcategory_id uuid REFERENCES service_subcategories(id),
        base_price integer, is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE provider_availability (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        day_of_week integer NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
        is_available boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE provider_portfolios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        image_url text NOT NULL, caption text, category_id uuid, display_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT TRUE, customer_consent_confirmed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE provider_certifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        name varchar(200) NOT NULL, issuing_body varchar(200) NOT NULL DEFAULT 'TESDA',
        certificate_number varchar(100), certificate_url text, issued_date date, expiry_date date,
        is_verified boolean NOT NULL DEFAULT FALSE, verified_at timestamptz,
        is_active boolean NOT NULL DEFAULT TRUE,
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id uuid NOT NULL REFERENCES providers(id),
        rating integer NOT NULL, quality_rating integer, punctuality_rating integer,
        professionalism_rating integer, communication_rating integer, value_rating integer,
        comment text, is_visible boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid REFERENCES users(id), status varchar(30) NOT NULL DEFAULT 'requested');
      CREATE TABLE wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        type varchar(30) NOT NULL
          CHECK (type IN ('customer', 'provider', 'platform_escrow', 'platform_revenue', 'guarantee_fund')),
        available_balance bigint NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
        pending_balance bigint NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
        currency varchar(3) NOT NULL DEFAULT 'PHP',
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE UNIQUE INDEX wallets_user_type ON wallets(user_id, type) WHERE user_id IS NOT NULL;
      CREATE TABLE wallet_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id uuid NOT NULL REFERENCES wallets(id),
        booking_id uuid REFERENCES bookings(id),
        type varchar(30) NOT NULL,
        amount bigint NOT NULL, balance_after bigint NOT NULL,
        description text NOT NULL DEFAULT '', reference_id varchar(255),
        created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type varchar(50) NOT NULL, title varchar(200) NOT NULL, body text NOT NULL, data jsonb,
        is_read boolean NOT NULL DEFAULT FALSE, created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE referral_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        code varchar(20) NOT NULL UNIQUE,
        type varchar(20) NOT NULL DEFAULT 'standard' CHECK (type IN ('standard', 'promo', 'influencer')),
        uses_count integer NOT NULL DEFAULT 0, max_uses integer,
        referrer_bonus bigint NOT NULL DEFAULT 5000, referee_bonus bigint NOT NULL DEFAULT 5000,
        is_active boolean NOT NULL DEFAULT TRUE, expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE referral_redemptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        referral_code_id uuid NOT NULL REFERENCES referral_codes(id),
        referrer_id uuid NOT NULL REFERENCES users(id),
        referee_id uuid NOT NULL REFERENCES users(id),
        referrer_bonus bigint NOT NULL, referee_bonus bigint NOT NULL,
        referrer_credited boolean NOT NULL DEFAULT FALSE, referee_credited boolean NOT NULL DEFAULT FALSE,
        qualifying_booking_id uuid REFERENCES bookings(id),
        created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE UNIQUE INDEX referral_redemptions_referee ON referral_redemptions(referee_id);
      CREATE TABLE suki_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL REFERENCES users(id),
        provider_id uuid NOT NULL REFERENCES providers(id),
        total_bookings integer NOT NULL DEFAULT 0, total_spent bigint NOT NULL DEFAULT 0,
        tier varchar(20) NOT NULL DEFAULT 'new' CHECK (tier IN ('new', 'regular', 'suki', 'super_suki')),
        points_balance integer NOT NULL DEFAULT 0, last_booking_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (customer_id, provider_id));
      CREATE TABLE suki_rewards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        membership_id uuid NOT NULL REFERENCES suki_memberships(id),
        booking_id uuid REFERENCES bookings(id),
        type varchar(20) NOT NULL CHECK (type IN ('earned', 'redeemed', 'expired', 'bonus')),
        points integer NOT NULL, description text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE otp_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone varchar(15) NOT NULL, code varchar(6), code_hash text,
        attempts integer NOT NULL DEFAULT 0, is_used boolean NOT NULL DEFAULT FALSE,
        expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE login_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone varchar(15) NOT NULL, ip_address inet NOT NULL,
        attempt_type varchar(20) NOT NULL CHECK (attempt_type IN ('otp_send', 'otp_verify', 'admin_login')),
        success boolean NOT NULL DEFAULT FALSE, device_fingerprint varchar(128), user_agent text,
        locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE security_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, event_type varchar(50) NOT NULL,
        ip_address inet, device_fingerprint text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE platform_settings (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        category varchar(50) NOT NULL, subcategory varchar(50),
        key varchar(100) NOT NULL UNIQUE, label varchar(200) NOT NULL, description text,
        value_type varchar(20) NOT NULL
          CHECK (value_type IN ('number','percent','currency','integer','boolean','string','json')),
        value text NOT NULL, default_value text NOT NULL,
        min_value numeric(14,4), max_value numeric(14,4), allowed_values text[],
        display_order integer NOT NULL DEFAULT 0, unit varchar(20),
        is_sensitive boolean NOT NULL DEFAULT FALSE, is_active boolean NOT NULL DEFAULT TRUE,
        requires_restart boolean NOT NULL DEFAULT FALSE, updated_by uuid REFERENCES users(id),
        updated_at timestamptz NOT NULL DEFAULT NOW(), created_at timestamptz NOT NULL DEFAULT NOW());
    `);
    await database.query(readMigration('051_platform_settings_audit.sql'));
    // The request_first_booking row exactly as migration 182 seeds it.
    await database.query(readMigration('182_request_first_booking_setting.sql'));
    if (options.migration188 !== false) await database.query(readMigration(MIGRATION_188));
    await seedPeople(database);
    Object.assign(pool, { query: database.query.bind(database), connect: database.connect.bind(database) });
    process.env.JWT_SECRET = p2Secret;
    await run(database);
  } finally {
    Object.assign(pool, original);
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    try { if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await database.end(); }
  }
}

async function seedPeople(database: Pool): Promise<void> {
  await database.query(`INSERT INTO users (id, role, phone, first_name, last_name, avatar_url, is_active) VALUES
      ($1, 'customer', '+639170000101', 'Maria', 'Santos', NULL, TRUE),
      ($2, 'customer', '+639170000102', 'Juan', 'dela Cruz', NULL, TRUE),
      ($3, 'super_admin', '+639170000103', 'Ana', 'Admin', NULL, TRUE),
      ($4, 'provider', '+639170000111', 'Ana', 'Reyes', $10, TRUE),
      ($5, 'provider', '+639170000112', 'Pedro', 'Pendiente', NULL, TRUE),
      ($6, 'provider', '+639170000113', 'Rosa', 'Rechazo', NULL, TRUE),
      ($7, 'provider', '+639170000114', 'Carlo', 'Suspendido', NULL, TRUE),
      ($8, 'provider', '+639170000115', 'Lito', 'Retirado', NULL, TRUE),
      ($9, 'provider', '+639170000116', 'Nena', 'Cerrado', NULL, FALSE)`,
  [customerUser, referrerUser, superAdminUser, approvedProviderUser, pendingProviderUser,
    rejectedProviderUser, suspendedProviderUser, deactivatedProviderUser, inactiveAccountProviderUser,
    approvedAvatarUrl]);
  await database.query(`INSERT INTO providers (id, user_id, business_name, tier, status, bio, rating, total_jobs,
        acceptance_rate, response_time_minutes, years_experience, service_radius_km, is_available,
        latitude, longitude, city, province) VALUES
      ($1, $7, 'Linis Pro Cleaning Services', 'verified', 'approved', 'Deep cleaning for homes and condos.',
        4.80, 42, 95.00, 12, 6, 15, TRUE, 10.31570000, 123.88540000, 'Cebu City', 'Cebu'),
      ($2, $8, 'Kuya Pedro Aircon Care', 'new', 'pending', NULL, 0, 0, 0, NULL, NULL, 10, TRUE,
        10.30000000, 123.90000000, 'Cebu City', 'Cebu'),
      ($3, $9, 'Rosa Plumbing Works', 'new', 'rejected', NULL, 0, 0, 0, NULL, NULL, 10, TRUE,
        10.30000000, 123.90000000, 'Mandaue City', 'Cebu'),
      ($4, $10, 'Carlo Electrical', 'pro', 'suspended', NULL, 4.20, 30, 80, NULL, NULL, 10, TRUE,
        10.30000000, 123.90000000, 'Lapu-Lapu City', 'Cebu'),
      ($5, $11, 'Lito Handyman', 'new', 'deactivated', NULL, 0, 0, 0, NULL, NULL, 10, TRUE,
        10.30000000, 123.90000000, 'Talisay City', 'Cebu'),
      ($6, $12, 'Nena Laundry Care', 'verified', 'approved', NULL, 4.50, 10, 90, NULL, NULL, 10, TRUE,
        10.30000000, 123.90000000, 'Cebu City', 'Cebu')`,
  [approvedProvider, pendingProvider, rejectedProvider, suspendedProvider, deactivatedProvider,
    inactiveAccountProvider, approvedProviderUser, pendingProviderUser, rejectedProviderUser,
    suspendedProviderUser, deactivatedProviderUser, inactiveAccountProviderUser]);
  await database.query(`INSERT INTO service_categories (id, name, slug) VALUES ($1, 'Cleaning', 'cleaning')`,
    [catalogCategory]);
  await database.query(`INSERT INTO service_subcategories (id, category_id, name, slug, description, pricing_type, base_price)
      VALUES ($1, $2, 'Home deep cleaning', 'home-deep-cleaning', 'Kitchen, bathroom and bedroom deep clean.', 'fixed', 150000)`,
  [catalogService, catalogCategory]);
  await database.query(`INSERT INTO provider_services (provider_id, category_id, subcategory_id) VALUES ($1, $2, $3)`,
    [approvedProvider, catalogCategory, catalogService]);
  await database.query(`INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time)
      VALUES ($1, 1, '08:00', '17:00')`, [approvedProvider]);
}

/** Set a platform setting's value directly, with updated_at `minutesAgo` minutes in the past. */
export async function setSettingRow(database: Pool, key: string, value: string, minutesAgo = 0): Promise<void> {
  const updated = await database.query(
    `UPDATE platform_settings SET value = $2, updated_at = NOW() - make_interval(mins => $3::int) WHERE key = $1`,
    [key, value, minutesAgo],
  );
  if (updated.rowCount !== 1) throw new Error(`Fixture setting ${key} is missing.`);
}

/** The given routers mounted at their production paths behind the real authentication middleware. */
export function p2Http(mounts: Array<[string, Router]>) {
  const app = express();
  app.use(express.json(), cookieParser());
  for (const [mountPath, router] of mounts) app.use(mountPath, router);
  app.use(errorMiddleware);
  const tokenFor = (userId: string, role: string): string =>
    jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, p2Secret, { expiresIn: '5m' });
  return {
    app,
    get: (url: string, as?: { userId: string; role: string }) => {
      const sent = request(app).get(url);
      return as ? sent.set('Authorization', `Bearer ${tokenFor(as.userId, as.role)}`) : sent;
    },
    post: (url: string, body: Record<string, unknown>, as?: { userId: string; role: string }) => {
      const sent = request(app).post(url).send(body);
      return as ? sent.set('Authorization', `Bearer ${tokenFor(as.userId, as.role)}`) : sent;
    },
    put: (url: string, body: Record<string, unknown>, as: { userId: string; role: string }) =>
      request(app).put(url).set('Authorization', `Bearer ${tokenFor(as.userId, as.role)}`).send(body),
  };
}

/** Wallet balances and ledger rows of the given users, for before/after comparisons. */
export async function walletSnapshot(database: Pool, userIds: string[]): Promise<unknown> {
  const wallets = (await database.query(
    `SELECT user_id, type, available_balance::text AS available_balance, pending_balance::text AS pending_balance
       FROM wallets WHERE user_id = ANY($1::uuid[]) ORDER BY user_id, type`, [userIds])).rows;
  const ledger = (await database.query(
    `SELECT w.user_id, t.type, t.amount::text AS amount, t.description
       FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
      WHERE w.user_id = ANY($1::uuid[]) ORDER BY t.created_at, t.id`, [userIds])).rows;
  return { wallets, ledger };
}

/**
 * Recurring tables for the D41 Q39 recurring checks: recurring_bookings and
 * recurring_instances as migrations 020, 059, 107 and 152 leave them (trimmed
 * to the columns the create path and the daily worker use), and the booking
 * columns those paths read or write. The fixture's bookings table is minimal,
 * so this widens it in place.
 */
export async function addRecurringTables(database: Pool): Promise<void> {
  await database.query(`
    ALTER TABLE bookings
      ADD COLUMN provider_id uuid REFERENCES providers(id),
      ADD COLUMN category_id uuid REFERENCES service_categories(id),
      ADD COLUMN subcategory_id uuid REFERENCES service_subcategories(id),
      ADD COLUMN booking_type varchar(20) NOT NULL DEFAULT 'fixed_price',
      ADD COLUMN description text, ADD COLUMN address text,
      ADD COLUMN barangay varchar(100), ADD COLUMN city varchar(100), ADD COLUMN province varchar(100),
      ADD COLUMN latitude numeric(10,8), ADD COLUMN longitude numeric(11,8),
      ADD COLUMN scheduled_at timestamptz,
      ADD COLUMN service_price bigint, ADD COLUMN service_fee bigint, ADD COLUMN total_amount bigint;
    CREATE TABLE recurring_bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id uuid REFERENCES providers(id),
      category_id uuid NOT NULL REFERENCES service_categories(id),
      subcategory_id uuid REFERENCES service_subcategories(id),
      original_booking_id uuid REFERENCES bookings(id),
      frequency varchar(20) NOT NULL CHECK (frequency IN ('weekly', 'bi_weekly', 'monthly')),
      preferred_day integer NOT NULL CHECK (preferred_day BETWEEN 0 AND 6),
      preferred_time time NOT NULL,
      address text NOT NULL, barangay varchar(100) NOT NULL, city varchar(100) NOT NULL,
      province varchar(100) NOT NULL, latitude numeric(10,8), longitude numeric(11,8),
      service_price bigint NOT NULL, service_fee bigint NOT NULL, total_amount bigint NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
      next_booking_date date NOT NULL, last_booking_date date, skip_dates date[] DEFAULT '{}',
      auto_charge boolean NOT NULL DEFAULT FALSE, allow_substitute boolean NOT NULL DEFAULT TRUE,
      total_instances integer NOT NULL DEFAULT 0, cancelled_at timestamptz, cancellation_reason text,
      created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
    CREATE TABLE recurring_instances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recurring_booking_id uuid NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
      booking_id uuid REFERENCES bookings(id),
      scheduled_date date NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'created', 'skipped', 'failed', 'substituted')),
      failure_reason text, created_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_recurring_instances_series_date UNIQUE (recurring_booking_id, scheduled_date));
  `);
}
