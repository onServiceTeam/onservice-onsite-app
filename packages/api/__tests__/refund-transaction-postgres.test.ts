import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { Pool } from 'pg';
import '../src/config/pg-types.config';
import { pool } from '../src/config/database.config';
import { db } from '../src/models/db';
import { refundFromEscrowInTransaction } from '../src/services/escrow.service';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../src/services/wallet.service';

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
