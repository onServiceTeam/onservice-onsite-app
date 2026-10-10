// Shared guarded PostgreSQL booking/refund fixtures, moved from
// refund-transaction-postgres.test.ts (Claude Code S1-0, 2026-10-10) so each
// booking-authority regression can live in its own file. Changes from the
// original lines: declarations are exported, the guarded test function is
// exported as bookingIntegrationIt (it was refundIt), and import and migration
// paths are one directory deeper. Fixture SQL and logic are unchanged, including
// the CI guard message. Test files that need the logger silenced must keep
// their own jest.mock('../src/utils/logger').
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Pool } from 'pg';
import '../../src/config/pg-types.config';
import { pool } from '../../src/config/database.config';
import { db } from '../../src/models/db';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../../src/services/wallet.service';
import bookingAdminRouter from '../../src/routes/booking-admin.routes';
import bookingRouter from '../../src/routes/booking.routes';
import providerStaffRouter from '../../src/routes/provider-staff.routes';
import { appendAuthorizationTermsInTransaction, appendProviderAssignmentTermsInTransaction } from '../../src/services/booking-financial-terms.service';
import { errorMiddleware } from '../../src/middleware/error.middleware';

export const databaseUrl = process.env.DATABASE_URL;
export const safeDatabase = (() => {
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
  throw new Error('Refund integration tests require the isolated localhost *_test PostgreSQL service in CI.');
}
export const bookingIntegrationIt = safeDatabase ? it : it.skip;

export const customerA = '10000000-0000-4000-8000-000000000001';
export const customerB = '20000000-0000-4000-8000-000000000002';
export const customerWalletA = '10000000-0000-4000-8000-000000000011';
export const customerWalletB = '20000000-0000-4000-8000-000000000022';
export const escrowWallet = '00000000-0000-4000-8000-000000000010';
export const bookingA = '30000000-0000-4000-8000-000000000001';
export const bookingB = '30000000-0000-4000-8000-000000000002';
export const operatorId = '40000000-0000-4000-8000-000000000001';
export const ticketId = '50000000-0000-4000-8000-000000000001';
export const otherTicketId = '50000000-0000-4000-8000-000000000002';
export const requestKey = '60000000-0000-4000-8000-000000000001';
export const secondKey = '60000000-0000-4000-8000-000000000002';
export const syntheticSecret = 'refund-http-synthetic-test-signing-secret-only';
export const providerUserA = '70000000-0000-4000-8000-000000000001';
export const providerUserB = '70000000-0000-4000-8000-000000000002';
export const providerA = '71000000-0000-4000-8000-000000000001';
export const providerB = '71000000-0000-4000-8000-000000000002';
export const refundBody = {
  amount: 25000, reason: 'Synthetic support-approved partial refund',
  supportTicketId: ticketId, idempotencyKey: requestKey,
};

export function assertRefundTestIdentity(
  peerAddress: string | undefined, expectedDatabase: string, actualDatabase: string | undefined,
): void {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peerAddress ?? '')
      || !expectedDatabase.endsWith('_test') || actualDatabase !== expectedDatabase) {
    throw new Error('Refund test connection must reach the exact requested *_test database through loopback.');
  }
}

// Focused SQL fixture with the wallet constraints from migrations 005/034/053.
// This is not a complete migration-chain or restored-production rehearsal.
export async function withRefundDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  if (!safeDatabase) throw new Error('Unsafe refund test database.');
  const schema = `refund_transaction_${crypto.randomUUID().replaceAll('-', '')}`;
  const database = new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 5000,
    application_name: schema,
    options: `-c search_path=${schema} -c statement_timeout=15000 -c lock_timeout=12000`,
  });
  const original = { query: pool.query, connect: pool.connect };
  let created = false;
  try {
    const connection = await database.connect();
    try {
      // PostgreSQL sees its container-side interface under CI port forwarding.
      // Validate the actual client TCP peer, not that translated server address.
      const socket = connection.connection.stream;
      if (!(socket instanceof Socket)) throw new Error('Refund tests require an inspectable TCP connection.');
      const target = new URL(databaseUrl!);
      const identity = await connection.query<{ name: string }>('SELECT current_database() AS name');
      assertRefundTestIdentity(socket.remoteAddress,
        decodeURIComponent(target.pathname.replace(/^\//, '')), identity.rows[0]?.name);
      if (socket.remotePort !== Number(target.port || '5432')) {
        throw new Error('Refund test connection did not reach the requested test port.');
      }
    } finally { connection.release(); }
    await database.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await database.query(`
      CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE bookings (id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES users(id), payment_method text);
      CREATE TABLE wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        type varchar(30) NOT NULL CHECK (type IN
          ('customer','provider','platform_escrow','platform_revenue','guarantee_fund')),
        available_balance bigint NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
        pending_balance bigint NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
        currency varchar(3) NOT NULL DEFAULT 'PHP',
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE UNIQUE INDEX wallets_user_type ON wallets(user_id,type) WHERE user_id IS NOT NULL;
      CREATE UNIQUE INDEX wallets_platform_type ON wallets(type) WHERE user_id IS NULL;
      CREATE TABLE wallet_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_id uuid NOT NULL REFERENCES wallets(id),
        booking_id uuid REFERENCES bookings(id),
        type varchar(30) NOT NULL CHECK (type IN
          ('payment','escrow_hold','escrow_release','commission','payout','refund','withdrawal',
           'guarantee_contribution','service_fee','adjustment')),
        amount bigint NOT NULL, balance_after bigint NOT NULL,
        description text NOT NULL DEFAULT '', reference_id varchar(255),
        created_at timestamptz NOT NULL DEFAULT NOW());
    `);
    Object.assign(pool, { query: database.query.bind(database), connect: database.connect.bind(database) });
    await database.query('INSERT INTO users(id) VALUES ($1),($2)', [customerA, customerB]);
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method)
      VALUES ($1,$2,'wallet'),($3,$4,'wallet')`, [bookingA, customerA, bookingB, customerB]);
    await database.query(`INSERT INTO wallets(id,user_id,type,available_balance)
      VALUES ($1,$2,'customer',250000),($3,$4,'customer',2000000),($5,NULL,'platform_escrow',0)`,
    [customerWalletA, customerA, customerWalletB, customerB, escrowWallet]);
    for (const [bookingId, walletId, amount] of [
      [bookingA, customerWalletA, 100000], [bookingB, customerWalletB, 1000000],
    ] as const) {
      await db.transaction(async client => {
        await client.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
        await debitWalletInTransaction(client, walletId, amount, 'payment', 'Synthetic booking funding', bookingId);
        await holdEscrowInTransaction(client, escrowWallet, amount, bookingId);
      });
    }
    await run(database);
  } finally {
    Object.assign(pool, original);
    try { if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await database.end(); }
  }
}

export async function snapshot(database: Pool) {
  return {
    wallets: (await database.query(`SELECT id,user_id,type,available_balance::text,pending_balance::text,
      updated_at FROM wallets ORDER BY id`)).rows,
    ledger: (await database.query(`SELECT * FROM wallet_transactions ORDER BY id`)).rows,
  };
}

// Exercise the mounted router, canonical authentication, real local money and
// payment accounting, and durable retry worker. No gateway/Redis delivery is
// allowed. Only the original unit-test network boundaries and logger are mocked.
export async function withOperatorRefundDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  const originalSecret = process.env.JWT_SECRET;
  const network = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('External delivery is forbidden in the wallet refund fixture.');
  });
  process.env.JWT_SECRET = syntheticSecret;
  try {
    await withRefundDatabase(async database => {
      await database.query(`
        ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'customer',
          ADD COLUMN is_active boolean NOT NULL DEFAULT TRUE,
          ADD COLUMN session_version integer NOT NULL DEFAULT 1,
          ADD COLUMN must_rotate_password boolean NOT NULL DEFAULT FALSE;
        ALTER TABLE bookings ADD COLUMN escrow_status text NOT NULL DEFAULT 'held',
          ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
        CREATE FUNCTION uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
        CREATE TABLE admin_actions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES users(id),
          action_type text NOT NULL CHECK (action_type IN ('refund_issued')),
          target_type text NOT NULL CHECK (target_type IN ('booking')), target_id uuid NOT NULL,
          details jsonb, reason text, full_notes text,
          created_at timestamptz NOT NULL DEFAULT NOW());
        CREATE TABLE payment_intents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid REFERENCES bookings(id),
          paymongo_intent_id text, paymongo_payment_id text,
          amount bigint NOT NULL CHECK (amount > 0),
          refunded_amount bigint NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
          payment_method text NOT NULL, status text NOT NULL CHECK (status IN
            ('succeeded','partially_refunded','refunded')), metadata jsonb,
          created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
        CREATE TABLE official_receipts (
          id uuid PRIMARY KEY, booking_id uuid REFERENCES bookings(id), or_number text,
          gross_amount bigint, provider_received bigint, platform_retained bigint,
          is_cancellation boolean, cancelled_at timestamptz, pdf_url text, issued_at timestamptz);
        CREATE TABLE admin_csrf_tokens (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id uuid NOT NULL REFERENCES users(id),
          token text NOT NULL, revoked_at timestamptz, expires_at timestamptz NOT NULL);
      `);
      for (const migration of ['045_support_tickets.sql', '092_gateway_retry_queue.sql', '163_admin_refund_integrity.sql']) {
        await database.query(fs.readFileSync(path.join(__dirname, '../../migrations', migration), 'utf8'));
      }
      await database.query("INSERT INTO users(id,role) VALUES ($1,'super_admin')", [operatorId]);
      await database.query(`INSERT INTO support_tickets
        (id,ticket_number,user_id,type,subject,description,booking_id)
        VALUES ($1,'SUP-SYNTHETIC-A',$2,'payment_issue','Synthetic refund','Fixture only',$3),
               ($4,'SUP-SYNTHETIC-B',$5,'payment_issue','Other booking','Fixture only',$6)`,
      [ticketId, customerA, bookingA, otherTicketId, customerB, bookingB]);
      await database.query(`INSERT INTO payment_intents(booking_id,amount,payment_method,status)
        VALUES ($1,100000,'wallet','succeeded'),($2,1000000,'wallet','succeeded')`, [bookingA, bookingB]);
      await run(database);
      expect(network).not.toHaveBeenCalled();
    });
  } finally {
    network.mockRestore();
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
}

export function refundHttp(role = 'super_admin', claims: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/admin/bookings', bookingAdminRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId: operatorId, role, sessionVersion: 1, type: 'access', ...claims },
    syntheticSecret, { expiresIn: '5m' });
  return {
    post: (body: Record<string, unknown> = refundBody, bookingId = bookingA) =>
      request(app).post(`/api/v1/admin/bookings/${bookingId}/escrow/refund`)
        .set('Authorization', `Bearer ${token}`).send(body),
    money: () => request(app).get(`/api/v1/admin/bookings/${bookingA}/money`)
      .set('Authorization', `Bearer ${token}`),
    cookiePost: (csrf?: string) => {
      const sent = request(app).post(`/api/v1/admin/bookings/${bookingA}/escrow/refund`)
        .set('Cookie', [`admin_session=${token}`, 'admin_csrf=synthetic-csrf'])
        .send(refundBody);
      return csrf ? sent.set('X-CSRF-Token', csrf) : sent;
    },
  };
}

export async function operatorSnapshot(database: Pool) {
  return {
    ...await snapshot(database),
    bookings: (await database.query('SELECT * FROM bookings ORDER BY id')).rows,
    intents: (await database.query('SELECT * FROM payment_intents ORDER BY id')).rows,
    cases: (await database.query('SELECT * FROM support_tickets ORDER BY id')).rows,
    messages: (await database.query('SELECT * FROM support_ticket_messages ORDER BY id')).rows,
    audits: (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows,
    retry: (await database.query('SELECT * FROM gateway_retry_queue ORDER BY id')).rows,
  };
}

// Paid, wallet-funded participant bookings with real immutable authorization
// terms (migration 162). Device push is disabled by stored preferences; inbox
// notifications, authentication, booking guards and cancellation SQL are real.
export async function withParticipantRefundDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withOperatorRefundDatabase(async database => {
    await database.query(`
      ALTER TABLE users ADD COLUMN preferred_locale text NOT NULL DEFAULT 'en';
      CREATE TABLE providers (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
        tier text NOT NULL DEFAULT 'founding', status text NOT NULL DEFAULT 'approved',
        total_cancellations integer NOT NULL DEFAULT 0, cancellations_last_30d integer NOT NULL DEFAULT 0,
        last_cancellation_at timestamptz, updated_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE service_categories (id uuid PRIMARY KEY);
      CREATE TABLE service_subcategories (id uuid PRIMARY KEY);
      CREATE TABLE platform_settings (key text PRIMARY KEY, value text NOT NULL,
        is_active boolean NOT NULL DEFAULT TRUE, updated_at timestamptz NOT NULL DEFAULT NOW());
      ALTER TABLE bookings ADD COLUMN status text NOT NULL DEFAULT 'paid',
        ADD COLUMN provider_id uuid REFERENCES providers(id), ADD COLUMN category_id uuid,
        ADD COLUMN subcategory_id uuid, ADD COLUMN service_price bigint, ADD COLUMN service_fee bigint,
        ADD COLUMN total_amount bigint, ADD COLUMN payment_intent_id uuid REFERENCES payment_intents(id),
        ADD COLUMN scheduled_at timestamptz NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT NOW(), ADD COLUMN cancelled_at timestamptz,
        ADD COLUMN cancellation_reason text, ADD COLUMN city text NOT NULL DEFAULT 'Cebu City',
        ADD COLUMN latitude numeric, ADD COLUMN longitude numeric,
        ADD COLUMN is_hourly boolean NOT NULL DEFAULT FALSE, ADD COLUMN work_started_at timestamptz;
      CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id), type varchar(50) NOT NULL,
        title text NOT NULL, body text NOT NULL, data jsonb, is_read boolean NOT NULL DEFAULT FALSE,
        created_at timestamptz NOT NULL DEFAULT NOW());
      CREATE TABLE notification_preferences (user_id uuid PRIMARY KEY REFERENCES users(id),
        booking_updates boolean NOT NULL DEFAULT FALSE, provider_activity boolean NOT NULL DEFAULT FALSE,
        payment_alerts boolean NOT NULL DEFAULT FALSE, messages boolean NOT NULL DEFAULT FALSE,
        promotions boolean NOT NULL DEFAULT FALSE, suki_rewards boolean NOT NULL DEFAULT FALSE,
        reminders boolean NOT NULL DEFAULT FALSE, system boolean NOT NULL DEFAULT FALSE,
        marketing_push_enabled boolean NOT NULL DEFAULT FALSE, marketing_sms_enabled boolean NOT NULL DEFAULT FALSE,
        marketing_email_enabled boolean NOT NULL DEFAULT FALSE, marketing_consent_acknowledged_at timestamptz,
        marketing_consent_version integer, quiet_hours_enabled boolean NOT NULL DEFAULT FALSE,
        quiet_hours_start text NOT NULL DEFAULT '22:00', quiet_hours_end text NOT NULL DEFAULT '07:00',
        quiet_hours_timezone text NOT NULL DEFAULT 'Asia/Manila');
      CREATE TABLE booking_slot_waitlist (id uuid PRIMARY KEY, category_id uuid, city text,
        preferred_date date, status text, expires_at timestamptz, created_at timestamptz DEFAULT NOW());
    `);
    await database.query("INSERT INTO users(id,role) VALUES ($1,'provider'),($2,'provider')",
      [providerUserA, providerUserB]);
    await database.query('INSERT INTO providers(id,user_id) VALUES ($1,$2),($3,$4)',
      [providerA, providerUserA, providerB, providerUserB]);
    await database.query(`INSERT INTO notification_preferences(user_id) VALUES ($1),($2)`, [customerA, customerB]);
    await database.query(`INSERT INTO platform_settings(key,value) VALUES
      ('service_fee_rate','25'),('service_fee_min','0'),('service_fee_max','1000000'),
      ('guarantee_fund_rate','10'),('cancel_refund_over_24h','100'),('cancel_refund_2_to_24h','75'),
      ('cancel_refund_1_to_2h','50'),('cancel_refund_30min_to_1h','25'),
      ('cancel_refund_under_30min','0'),('cancel_refund_provider_arrived','0'),
      ('cancel_refund_customer_noshow','0'),('commission_rate_founding','15');
      UPDATE bookings SET service_price = CASE WHEN id='${bookingA}' THEN 80000 ELSE 800000 END,
        service_fee = CASE WHEN id='${bookingA}' THEN 20000 ELSE 200000 END,
        total_amount = CASE WHEN id='${bookingA}' THEN 100000 ELSE 1000000 END,
        payment_intent_id=(SELECT id FROM payment_intents WHERE booking_id=bookings.id);
      INSERT INTO wallets(type) VALUES ('platform_revenue'),('guarantee_fund');
    `);
    await database.query(fs.readFileSync(path.join(__dirname, '../../migrations/162_immutable_booking_financial_terms.sql'), 'utf8'));
    for (const bookingId of [bookingA, bookingB]) {
      await db.transaction(client => appendAuthorizationTermsInTransaction(client, {
        bookingId, event: 'wallet_payment_authorized', sourceEventId: bookingId,
      }));
    }
    await run(database);
  });
}

export function participantHttp(userId: string, role: string, claims: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/bookings', bookingRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access', ...claims },
    syntheticSecret, { expiresIn: '5m' });
  // extraBody adds request fields such as the provider's arrival coordinates.
  // Existing callers pass two arguments and send exactly the original body.
  return (bookingId: string, status: string, extraBody: Record<string, unknown> = {}) => request(app)
    .patch(`/api/v1/bookings/${bookingId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status, cancellationReason: 'Synthetic participant cancellation', ...extraBody });
}

export async function withStaffJobListDatabase(run: (database: Pool, staffUserId: string, staffId: string) => Promise<void>) {
  await withParticipantRefundDatabase(async database => {
    await database.query(`ALTER TABLE users ADD COLUMN first_name text, ADD COLUMN last_name text;
      ALTER TABLE providers ADD COLUMN business_name text;
      ALTER TABLE service_categories ADD COLUMN name text;
      ALTER TABLE service_subcategories ADD COLUMN name text;
      ALTER TABLE bookings ADD COLUMN address text, ADD COLUMN barangay text;
      CREATE TABLE reviews (id uuid PRIMARY KEY);`);
    // Execute D23's actual staff table, approval constraint and individual FKs.
    // This is still a scoped fixture, not the complete production chain.
    await database.query(fs.readFileSync(path.resolve(__dirname, '../../migrations/131_provider_staff.sql'), 'utf8'));
    const staffUserId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    await database.query("INSERT INTO users(id,role) VALUES ($1,'provider_staff')", [staffUserId]);
    await database.query("INSERT INTO provider_staff(id,provider_id,user_id,status) VALUES ($1,$2,$3,'approved')",
      [staffId, providerB, staffUserId]);
    await database.query("UPDATE users SET first_name='Synthetic',last_name=CASE WHEN id=$1 THEN 'Customer A' ELSE 'Customer B' END WHERE id IN ($1,$2)",
      [customerA, customerB]);
    await database.query("UPDATE providers SET business_name=CASE WHEN id=$1 THEN 'Synthetic team A' ELSE 'Synthetic team B' END", [providerA]);
    const categoryId = crypto.randomUUID();
    const subcategoryId = crypto.randomUUID();
    await database.query("INSERT INTO service_categories(id,name) VALUES ($1,'Synthetic cleaning')", [categoryId]);
    await database.query("INSERT INTO service_subcategories(id,name) VALUES ($1,'Synthetic turnover')", [subcategoryId]);
    await database.query('UPDATE bookings SET category_id=$1,subcategory_id=$2', [categoryId, subcategoryId]);
    await database.query("UPDATE bookings SET performer_staff_id=$1,address=CASE WHEN id=$2 THEN 'Synthetic address A' ELSE 'Synthetic address B' END,barangay='Synthetic barangay'",
      [staffId, bookingA]);
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingA, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingA, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingA,
      });
    });
    await run(database, staffUserId, staffId);
  });
}

export function staffJobsHttp(userId: string, role = 'provider_staff', claims: Record<string, unknown> = {}) {
  const app = express();
  app.use(cookieParser());
  app.use('/api/v1/staff', providerStaffRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, type: 'access', sessionVersion: 1, ...claims }, syntheticSecret, { expiresIn: '5m' });
  return () => request(app).get('/api/v1/staff/my-jobs').set('Authorization', `Bearer ${token}`);
}

export async function participantSnapshot(database: Pool) {
  return {
    ...await operatorSnapshot(database),
    providers: (await database.query('SELECT * FROM providers ORDER BY id')).rows,
    terms: (await database.query('SELECT * FROM booking_financial_terms ORDER BY id')).rows,
    notifications: (await database.query('SELECT * FROM notifications ORDER BY id')).rows,
    waitlist: (await database.query('SELECT * FROM booking_slot_waitlist ORDER BY id')).rows,
  };
}
