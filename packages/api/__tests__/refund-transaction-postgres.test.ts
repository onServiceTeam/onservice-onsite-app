import crypto from 'node:crypto';
import { Socket } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Pool } from 'pg';
import '../src/config/pg-types.config';
import { pool } from '../src/config/database.config';
import { db } from '../src/models/db';
import { refundFromEscrowInTransaction } from '../src/services/escrow.service';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../src/services/wallet.service';
import bookingAdminRouter from '../src/routes/booking-admin.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';
import { processRetries } from '../src/services/gateway-retry.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

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
  throw new Error('Refund integration tests require the isolated localhost *_test PostgreSQL service in CI.');
}
const refundIt = safeDatabase ? it : it.skip;

const customerA = '10000000-0000-4000-8000-000000000001';
const customerB = '20000000-0000-4000-8000-000000000002';
const customerWalletA = '10000000-0000-4000-8000-000000000011';
const customerWalletB = '20000000-0000-4000-8000-000000000022';
const escrowWallet = '00000000-0000-4000-8000-000000000010';
const bookingA = '30000000-0000-4000-8000-000000000001';
const bookingB = '30000000-0000-4000-8000-000000000002';
const operatorId = '40000000-0000-4000-8000-000000000001';
const ticketId = '50000000-0000-4000-8000-000000000001';
const otherTicketId = '50000000-0000-4000-8000-000000000002';
const requestKey = '60000000-0000-4000-8000-000000000001';
const secondKey = '60000000-0000-4000-8000-000000000002';
const syntheticSecret = 'refund-http-synthetic-test-signing-secret-only';
const refundBody = {
  amount: 25000, reason: 'Synthetic support-approved partial refund',
  supportTicketId: ticketId, idempotencyKey: requestKey,
};

function assertRefundTestIdentity(
  peerAddress: string | undefined, expectedDatabase: string, actualDatabase: string | undefined,
): void {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peerAddress ?? '')
      || !expectedDatabase.endsWith('_test') || actualDatabase !== expectedDatabase) {
    throw new Error('Refund test connection must reach the exact requested *_test database through loopback.');
  }
}

// Focused SQL fixture with the wallet constraints from migrations 005/034/053.
// This is not a complete migration-chain or restored-production rehearsal.
async function withRefundDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
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

async function snapshot(database: Pool) {
  return {
    wallets: (await database.query(`SELECT id,user_id,type,available_balance::text,pending_balance::text,
      updated_at FROM wallets ORDER BY id`)).rows,
    ledger: (await database.query(`SELECT * FROM wallet_transactions ORDER BY id`)).rows,
  };
}

async function refund(amount: number) {
  return db.transaction(client => refundFromEscrowInTransaction(
    client, bookingA, amount, 'Synthetic support refund',
  ));
}

// Exercise the mounted router, canonical authentication, real local money and
// payment accounting, and durable retry worker. No gateway/Redis delivery is
// allowed. Only the original unit-test network boundaries and logger are mocked.
async function withOperatorRefundDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
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
        await database.query(fs.readFileSync(path.join(__dirname, '../migrations', migration), 'utf8'));
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

function refundHttp(role = 'super_admin', claims: Record<string, unknown> = {}) {
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

async function operatorSnapshot(database: Pool) {
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

it('refund fixture requires the actual loopback peer and exact requested test database', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    expect(() => assertRefundTestIdentity(peer, 'refund_test', 'refund_test')).not.toThrow();
  }
  for (const peer of [undefined, '', 'localhost', '127.0.0.1.example.invalid', '172.18.0.2', '203.0.113.7']) {
    expect(() => assertRefundTestIdentity(peer, 'refund_test', 'refund_test')).toThrow();
  }
  for (const [expected, actual] of [
    ['refund_test', undefined], ['refund_test', 'another_test'], ['refund_test', 'onservice'],
    ['onservice', 'onservice'],
  ]) {
    expect(() => assertRefundTestIdentity('127.0.0.1', expected!, actual)).toThrow();
  }
});

refundIt('wallet refund returns the full original payment without touching another booking', async () => {
  await withRefundDatabase(async database => {
    const before = await snapshot(database);
    const result = await refund(100000);
    expect(result).toEqual({ remainingEscrowCentavos: 0, paymentMethod: 'wallet', customerWalletCredited: true });
    const balances = await database.query(`SELECT id,available_balance::text,pending_balance::text
      FROM wallets ORDER BY id`);
    expect(balances.rows).toEqual([
      { id: escrowWallet, available_balance: '0', pending_balance: '1000000' },
      { id: customerWalletA, available_balance: '250000', pending_balance: '0' },
      { id: customerWalletB, available_balance: '1000000', pending_balance: '0' },
    ]);
    const movements = await database.query(`SELECT wallet_id,amount::text,balance_after::text,reference_id
      FROM wallet_transactions WHERE booking_id=$1 AND type='refund' ORDER BY wallet_id`, [bookingA]);
    expect(movements.rows).toEqual([
      { wallet_id: escrowWallet, amount: '-100000', balance_after: '1000000', reference_id: null },
      { wallet_id: customerWalletA, amount: '100000', balance_after: '250000', reference_id: bookingA },
    ]);
    expect((await database.query(`SELECT SUM(amount)::text AS amount FROM wallet_transactions
      WHERE booking_id=$1 AND type='refund'`, [bookingA])).rows).toEqual([{ amount: '0' }]);
    expect((await snapshot(database)).ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    const after = await snapshot(database);
    await expect(refund(100000)).rejects.toMatchObject({ statusCode: 409 });
    expect(await snapshot(database)).toEqual(after);
  });
}, 30000);

refundIt('booking-scoped cap rejects excessive and concurrent refunds despite shared escrow funds', async () => {
  await withRefundDatabase(async database => {
    const before = await snapshot(database);
    await expect(refund(100001)).rejects.toMatchObject({ statusCode: 409 });
    expect(await snapshot(database)).toEqual(before);
    const outcomes = await Promise.allSettled([refund(70000), refund(70000)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find(outcome => outcome.status === 'rejected');
    expect(rejection).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } });
    expect((await database.query(`SELECT SUM(amount)::text AS remaining FROM wallet_transactions
      WHERE wallet_id=$1 AND booking_id=$2`, [escrowWallet, bookingA])).rows)
      .toEqual([{ remaining: '30000' }]);
    expect((await database.query(`SELECT available_balance::text AS amount FROM wallets WHERE id=$1`,
      [customerWalletA])).rows).toEqual([{ amount: '220000' }]);
    expect((await snapshot(database)).ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
  });
}, 30000);

refundIt('customer refund-ledger failure rolls back both balances and permits the same refund after repair', async () => {
  await withRefundDatabase(async database => {
    await database.query(`CREATE FUNCTION reject_customer_refund() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.wallet_id='${customerWalletA}'::uuid AND NEW.type='refund' THEN
        RAISE EXCEPTION 'Synthetic customer refund ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_customer_refund BEFORE INSERT ON wallet_transactions
        FOR EACH ROW EXECUTE FUNCTION reject_customer_refund();`);
    const before = await snapshot(database);
    await expect(refund(100000)).rejects.toMatchObject({ code: 'P0001' });
    expect(await snapshot(database)).toEqual(before);
    await database.query('DROP TRIGGER reject_customer_refund ON wallet_transactions');
    await expect(refund(100000)).resolves.toMatchObject({ remainingEscrowCentavos: 0, customerWalletCredited: true });
    expect((await database.query(`SELECT count(*)::int AS count FROM wallet_transactions
      WHERE booking_id=$1 AND type='refund'`, [bookingA])).rows).toEqual([{ count: 2 }]);
    expect((await database.query('SELECT available_balance::text AS amount FROM wallets WHERE id=$1',
      [customerWalletA])).rows).toEqual([{ amount: '250000' }]);
  });
}, 30000);

refundIt('invalid refund amounts leave all customer and escrow data unchanged', async () => {
  await withRefundDatabase(async database => {
    const before = await snapshot(database);
    for (const amount of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(refund(amount)).rejects.toMatchObject({ statusCode: 400 });
      expect(await snapshot(database)).toEqual(before);
    }
  });
}, 30000);

refundIt('operator HTTP partial refund links case, ledger and accounting and replays without another movement', async () => {
  await withOperatorRefundDatabase(async database => {
    const before = await operatorSnapshot(database);
    const http = refundHttp();
    const first = await http.post();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      bookingId: bookingA, refundedAmount: 25000, supportTicketId: ticketId,
      remainingEscrowAmount: 75000, customerWalletCredited: true,
      idempotentReplay: false, paymentProcessingStatus: 'processed', paymentProcessingQueued: false,
    });
    const committed = await operatorSnapshot(database);
    expect(committed.audits).toHaveLength(1);
    expect(committed.audits[0]).toMatchObject({
      id: first.body.data.adminActionId, admin_id: operatorId, action_type: 'refund_issued',
      target_id: bookingA, reason: refundBody.reason,
      details: { bookingId: bookingA, supportTicketId: ticketId, idempotencyKey: requestKey,
        refundAmount: 25000, remainingEscrowAmount: 75000 },
    });
    expect(committed.messages).toHaveLength(1);
    expect(committed.messages[0]).toMatchObject({
      ticket_id: ticketId, sender_id: operatorId, sender_role: 'super_admin', is_internal_note: true,
      message: expect.stringContaining(first.body.data.adminActionId),
    });
    expect(committed.retry).toHaveLength(1);
    expect(committed.retry[0]).toMatchObject({
      id: committed.audits[0].details.paymentRetryId,
      booking_id: bookingA, action_type: 'process_payment_refund', amount_centavos: 25000, status: 'succeeded',
    });
    expect(committed.intents.find(row => row.booking_id === bookingA))
      .toMatchObject({ refunded_amount: 25000, status: 'partially_refunded' });
    expect(committed.bookings.find(row => row.id === bookingA)).toMatchObject({ escrow_status: 'partially_refunded' });
    expect(committed.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
    expect(committed.ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    expect(committed.intents.find(row => row.booking_id === bookingB))
      .toEqual(before.intents.find(row => row.booking_id === bookingB));

    const money = await http.money();
    expect(money.status).toBe(200);
    expect(money.body.data.paymentIntents).toHaveLength(1);
    expect(money.body.data.paymentIntents[0]).toMatchObject({
      amount: 100000, refundedAmount: 25000, paymentMethod: 'wallet', status: 'partially_refunded',
    });
    expect(money.body.data.ledgerEntries.filter((row: { type: string }) => row.type === 'refund'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ walletType: 'customer', amount: 25000 }),
        expect.objectContaining({ walletType: 'platform_escrow', amount: -25000 }),
      ]));

    // Case closure after a committed operation must not turn a retry into a
    // second operation or require a fabricated new active case.
    await database.query("UPDATE support_tickets SET status='closed' WHERE id=$1", [ticketId]);
    const closed = await operatorSnapshot(database);
    const replay = await http.post();
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual({ ...first.body.data, idempotentReplay: true });
    expect(await operatorSnapshot(database)).toEqual(closed);
    for (const [body, bookingId] of [
      [{ ...refundBody, amount: 26000 }, bookingA],
      [{ ...refundBody, reason: 'Different support-approved reason' }, bookingA],
      [{ ...refundBody, supportTicketId: otherTicketId }, bookingA],
      [refundBody, bookingB],
    ] as const) {
      expect((await http.post(body, bookingId)).status).toBe(409);
      expect(await operatorSnapshot(database)).toEqual(closed);
    }
    await database.query("UPDATE support_tickets SET status='open' WHERE id=$1", [ticketId]);
    const remainder = await http.post({ ...refundBody, amount: 75000, idempotencyKey: secondKey });
    expect(remainder.status).toBe(200);
    expect(remainder.body.data).toMatchObject({ remainingEscrowAmount: 0, idempotentReplay: false });
    const final = await operatorSnapshot(database);
    expect(final.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '250000' });
    expect(final.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 100000, status: 'refunded' });
    expect(final.bookings.find(row => row.id === bookingA)).toMatchObject({ escrow_status: 'refunded' });
    expect(final.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(4);
  });
}, 30000);

refundIt('operator refund HTTP role, purpose, current authority, CSRF and case guards preserve money', async () => {
  await withOperatorRefundDatabase(async database => {
    const before = await operatorSnapshot(database);
    for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'dpo']) {
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, operatorId]);
      expect((await refundHttp(role).post()).status).toBe(403);
      expect(await operatorSnapshot(database)).toEqual(before);
    }
    await database.query("UPDATE users SET role='super_admin' WHERE id=$1", [operatorId]);
    expect((await refundHttp('super_admin', { type: 'pre_auth_2fa_setup' }).post()).status).toBe(401);
    await database.query('UPDATE users SET session_version=2 WHERE id=$1', [operatorId]);
    expect((await refundHttp().post()).status).toBe(401);
    await database.query('UPDATE users SET session_version=1,is_active=FALSE WHERE id=$1', [operatorId]);
    expect((await refundHttp().post()).status).toBe(401);
    await database.query('UPDATE users SET is_active=TRUE,must_rotate_password=TRUE WHERE id=$1', [operatorId]);
    expect((await refundHttp().post()).status).toBe(428);
    await database.query('UPDATE users SET must_rotate_password=FALSE WHERE id=$1', [operatorId]);
    expect(await operatorSnapshot(database)).toEqual(before);

    const http = refundHttp();
    for (const csrf of [undefined, 'wrong-csrf', 'synthetic-csrf']) {
      expect((await http.cookiePost(csrf)).status).toBe(403);
      expect(await operatorSnapshot(database)).toEqual(before);
    }
    for (const [body, expectedStatus] of [
      [{ ...refundBody, amount: 0 }, 400], [{ ...refundBody, amount: 0.5 }, 400],
      [{ ...refundBody, amount: 100001 }, 409], [{ ...refundBody, reason: 'short' }, 400],
      [{ ...refundBody, supportTicketId: 'invalid' }, 400],
      [{ ...refundBody, idempotencyKey: 'invalid' }, 400],
      [{ ...refundBody, supportTicketId: otherTicketId }, 409],
    ] as const) {
      expect((await http.post(body)).status).toBe(expectedStatus);
      expect(await operatorSnapshot(database)).toEqual(before);
    }
    await database.query("UPDATE support_tickets SET status='resolved' WHERE id=$1", [ticketId]);
    const resolved = await operatorSnapshot(database);
    expect((await http.post()).status).toBe(409);
    expect(await operatorSnapshot(database)).toEqual(resolved);
    await database.query("UPDATE support_tickets SET status='open' WHERE id=$1", [ticketId]);
    await database.query(`INSERT INTO admin_csrf_tokens(admin_user_id,token,expires_at)
      VALUES ($1,'synthetic-csrf',NOW()+INTERVAL '5 minutes')`, [operatorId]);
    expect((await http.cookiePost('synthetic-csrf')).status).toBe(200);
    expect((await operatorSnapshot(database)).audits).toHaveLength(1);
  });
}, 30000);

refundIt('operator outbox, audit or support-note SQL failure rolls back the whole local refund before retry', async () => {
  for (const target of ['gateway_retry_queue', 'admin_actions', 'support_ticket_messages']) {
    await withOperatorRefundDatabase(async database => {
      await database.query(`CREATE FUNCTION reject_operator_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic operator persistence failure'; END $$;
        CREATE TRIGGER reject_operator_write BEFORE INSERT ON ${target}
          FOR EACH ROW EXECUTE FUNCTION reject_operator_write();`);
      const before = await operatorSnapshot(database);
      const http = refundHttp();
      const failed = await http.post();
      expect(failed.status).toBe(500);
      expect(failed.body.error.message).toBe('An unexpected error occurred. Please try again later.');
      expect(await operatorSnapshot(database)).toEqual(before);
      await database.query(`DROP TRIGGER reject_operator_write ON ${target}`);
      expect((await http.post()).status).toBe(200);
      const after = await operatorSnapshot(database);
      expect(after.audits).toHaveLength(1);
      expect(after.retry).toHaveLength(1);
      expect(after.messages).toHaveLength(1);
      expect(after.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(2);
    });
  }
}, 30000);

refundIt('concurrent operator HTTP requests sharing a partial-refund key commit one operation', async () => {
  await withOperatorRefundDatabase(async database => {
    const http = refundHttp();
    const responses = await Promise.all([http.post(), http.post()]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(responses.map(response => response.body.data.idempotentReplay).sort()).toEqual([false, true]);
    expect(new Set(responses.map(response => response.body.data.adminActionId)).size).toBe(1);
    const after = await operatorSnapshot(database);
    expect(after.audits).toHaveLength(1);
    expect(after.messages).toHaveLength(1);
    expect(after.retry).toHaveLength(1);
    expect(after.ledger.filter(row => row.booking_id === bookingA && row.type === 'refund')).toHaveLength(2);
    expect(after.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 25000 });
    expect(after.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
  });
}, 30000);

refundIt('concurrent distinct operator refund keys cannot spend another booking escrow to bypass the cap', async () => {
  await withOperatorRefundDatabase(async database => {
    const before = await operatorSnapshot(database);
    const http = refundHttp();
    const responses = await Promise.all([
      http.post({ ...refundBody, amount: 70000 }),
      http.post({ ...refundBody, amount: 70000, idempotencyKey: secondKey }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const after = await operatorSnapshot(database);
    expect(after.audits).toHaveLength(1);
    expect(after.retry).toHaveLength(1);
    expect(after.messages).toHaveLength(1);
    expect(after.ledger.filter(row => row.booking_id === bookingB))
      .toEqual(before.ledger.filter(row => row.booking_id === bookingB));
    expect(after.intents.find(row => row.booking_id === bookingB))
      .toEqual(before.intents.find(row => row.booking_id === bookingB));
    expect(after.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '220000' });
    expect(after.intents.find(row => row.booking_id === bookingA)).toMatchObject({ refunded_amount: 70000 });
  });
}, 30000);

refundIt('actual payment-only worker repairs failed wallet accounting without repeating the committed operator refund', async () => {
  await withOperatorRefundDatabase(async database => {
    await database.query(`CREATE FUNCTION reject_refund_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic refund accounting failure'; END $$;
      CREATE TRIGGER reject_refund_accounting BEFORE UPDATE ON payment_intents
        FOR EACH ROW EXECUTE FUNCTION reject_refund_accounting();`);
    const http = refundHttp();
    const first = await http.post();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      customerWalletCredited: true, paymentProcessingQueued: true, paymentProcessingStatus: 'queued',
    });
    const committed = await operatorSnapshot(database);
    expect(committed.retry[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(committed.intents.find(row => row.booking_id === bookingA)).toMatchObject({ status: 'succeeded', refunded_amount: 0 });
    expect(committed.wallets.find(row => row.id === customerWalletA)).toMatchObject({ available_balance: '175000' });
    const replay = await http.post();
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'queued' });
    expect(await operatorSnapshot(database)).toEqual(committed);
    await database.query('DROP TRIGGER reject_refund_accounting ON payment_intents');
    await database.query("UPDATE gateway_retry_queue SET next_retry_at=NOW()-INTERVAL '1 second'");
    expect(await processRetries()).toEqual({ attempted: 1, succeeded: 1, failedAndRetrying: 0, failedPermanent: 0 });
    const repaired = await operatorSnapshot(database);
    expect(repaired.wallets).toEqual(committed.wallets);
    expect(repaired.ledger).toEqual(committed.ledger);
    expect(repaired.audits).toEqual(committed.audits);
    expect(repaired.messages).toEqual(committed.messages);
    expect(repaired.intents.find(row => row.booking_id === bookingA)).toMatchObject({ status: 'partially_refunded', refunded_amount: 25000 });
    expect(repaired.retry[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(await processRetries()).toEqual({ attempted: 0, succeeded: 0, failedAndRetrying: 0, failedPermanent: 0 });
    expect(await operatorSnapshot(database)).toEqual(repaired);
    expect((await http.post()).body.data).toMatchObject({ idempotentReplay: true, paymentProcessingStatus: 'processed' });
    expect(await operatorSnapshot(database)).toEqual(repaired);
  });
}, 30000);
