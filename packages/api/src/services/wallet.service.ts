import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';

interface WalletRow {
  id: string;
  user_id: string | null;
  type: string;
  available_balance: string;
  pending_balance: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

interface TransactionRow {
  id: string;
  wallet_id: string;
  booking_id: string | null;
  type: string;
  amount: string;
  balance_after: string;
  description: string;
  reference_id: string | null;
  created_at: Date;
}

interface CountRow { count: string }

type TransactionType =
  | 'payment' | 'escrow_hold' | 'escrow_release' | 'commission'
  | 'payout' | 'refund' | 'withdrawal' | 'guarantee_contribution' | 'service_fee';

export async function getUserWallet(userId: string, type: 'customer' | 'provider'): Promise<WalletRow> {
  const result = await db.query<WalletRow>(
    `SELECT * FROM wallets WHERE user_id = $1 AND type = $2`,
    [userId, type],
  );

  if (result.rows.length > 0) return result.rows[0]!;

  const created = await db.query<WalletRow>(
    `INSERT INTO wallets (user_id, type) VALUES ($1, $2)
     ON CONFLICT (user_id, type) WHERE user_id IS NOT NULL DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, type],
  );

  const wallet = created.rows[0]!;
  if (wallet.type !== type) {
    throw createAppError(
      `Wallet type mismatch: expected "${type}" but found "${wallet.type}" for user ${userId}.`,
      409,
    );
  }
  return wallet;
}

export async function getPlatformWallet(type: 'platform_escrow' | 'platform_revenue' | 'guarantee_fund'): Promise<WalletRow> {
  const result = await db.query<WalletRow>(
    `SELECT * FROM wallets WHERE type = $1 AND user_id IS NULL`,
    [type],
  );

  if (result.rows.length === 0) {
    throw createAppError(`Platform wallet "${type}" not found. Run seed migration.`, 500);
  }

  return result.rows[0]!;
}

export async function creditWallet(
  walletId: string,
  amount: number,
  txType: TransactionType,
  description: string,
  bookingId?: string,
  referenceId?: string,
): Promise<TransactionRow> {
  if (amount <= 0) throw createAppError('Credit amount must be positive.', 400);

  return db.transaction(async (client) => {
    const wallet = await client.query<WalletRow>(
      `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [amount, walletId],
    );

    if (wallet.rows.length === 0) throw createAppError('Wallet not found.', 404);

    const tx = await client.query<TransactionRow>(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [walletId, bookingId ?? null, txType, amount, wallet.rows[0]!.available_balance, description, referenceId ?? null],
    );

    return tx.rows[0]!;
  });
}

export async function debitWallet(
  walletId: string,
  amount: number,
  txType: TransactionType,
  description: string,
  bookingId?: string,
  referenceId?: string,
): Promise<TransactionRow> {
  if (amount <= 0) throw createAppError('Debit amount must be positive.', 400);
  return db.transaction(async (client) => {
    return debitWalletInTransaction(
      client, walletId, amount, txType, description, bookingId, referenceId,
    );
  });
}

// MED-N158 fix — trx-aware variant. Used by the wallet-payment path
// in payment.routes which needs to combine debit + payment status
// update + booking flip + escrow hold into one atomic unit so
// failures don't leave money in a stuck state (debited but no
// payment record / escrow hold).
export async function debitWalletInTransaction(
  // Phase L typecheck fix — was inline `{ query: ...Promise<any> }`
  // which lost the generic and produced TS2558 on the .query<TRow>
  // calls. Use the canonical PgClient alias.
  client: PgClient,
  walletId: string,
  amount: number,
  txType: TransactionType,
  description: string,
  bookingId?: string,
  referenceId?: string,
): Promise<TransactionRow> {
  if (amount <= 0) throw createAppError('Debit amount must be positive.', 400);
  const wallet = await client.query<WalletRow>(
    `UPDATE wallets SET available_balance = available_balance - $1, updated_at = NOW()
     WHERE id = $2 AND available_balance >= $1 RETURNING *`,
    [amount, walletId],
  );
  if (wallet.rows.length === 0) throw createAppError('Insufficient wallet balance.', 400);
  const tx = await client.query<TransactionRow>(
    `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [walletId, bookingId ?? null, txType, -amount, wallet.rows[0]!.available_balance, description, referenceId ?? null],
  );
  return tx.rows[0]!;
}

export async function holdEscrow(
  walletId: string,
  amount: number,
  bookingId: string,
): Promise<void> {
  if (amount <= 0) throw createAppError('Escrow hold amount must be positive.', 400);
  await db.transaction(async (client) => {
    await holdEscrowInTransaction(client, walletId, amount, bookingId);
  });
}

// MED-N156 fix — trx-aware variant so webhook handlers (and any other
// caller that already owns a transactional client) can include the
// escrow ledger writes in their own atomic unit. Same logic as
// holdEscrow but takes the client instead of opening its own trx.
//
// We intentionally keep holdEscrow as a thin wrapper for back-compat
// with callers that don't have a client to pass.
//
// Type for client mirrors db.transaction's callback parameter shape
// (a thin wrapper around pg's PoolClient.query that returns the
// QueryResultRow-constrained shape).
import type { QueryResult, QueryResultRow } from 'pg';
type PgClient = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
};
export async function holdEscrowInTransaction(
  client: PgClient,
  walletId: string,
  amount: number,
  bookingId: string,
): Promise<void> {
  if (amount <= 0) throw createAppError('Escrow hold amount must be positive.', 400);
  await client.query(
    `UPDATE wallets SET pending_balance = pending_balance + $1, updated_at = NOW() WHERE id = $2`,
    [amount, walletId],
  );
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
     VALUES ($1, $2, 'escrow_hold', $3, (SELECT pending_balance FROM wallets WHERE id = $1), $4)`,
    [walletId, bookingId, amount, `Escrow hold for booking`],
  );
}

/**
 * A5 / H3 — acquire row-level write locks on the given wallets in a
 * deterministic order (by id) so concurrent money transactions serialize on
 * the shared rows (notably the single `platform_escrow` wallet) instead of
 * racing. Pre-fix, escrow refunds checked the pending balance OUTSIDE the
 * transaction (a check-then-act race that could let two concurrent refunds
 * both pass and over-drain the shared pool), and balance reads weren't
 * serialized.
 *
 * Acquiring all needed locks in a single `ORDER BY id ... FOR UPDATE`
 * statement is what makes this deadlock-free: every transaction that touches
 * an overlapping set of wallets takes the locks in the same global order, so
 * no two transactions can hold-and-wait in a cycle. Call this once, early in
 * the transaction (after any bookings-row lock), before reading or writing
 * balances.
 */
export async function lockWalletsForUpdate(client: PgClient, walletIds: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(walletIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return;
  await client.query(
    `SELECT id FROM wallets WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [unique],
  );
}

export async function getWalletTransactions(
  walletId: string,
  page = 1,
  pageSize = 20,
): Promise<{ transactions: TransactionRow[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM wallet_transactions WHERE wallet_id = $1`,
      [walletId],
    ),
    db.query<TransactionRow>(
      `SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [walletId, pageSize, offset],
    ),
  ]);

  return {
    transactions: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export function formatWallet(w: WalletRow): Record<string, unknown> {
  return {
    id: w.id,
    userId: w.user_id,
    type: w.type,
    availableBalance: Number(w.available_balance),
    pendingBalance: Number(w.pending_balance),
    currency: w.currency,
    createdAt: w.created_at,
  };
}

export function formatTransaction(t: TransactionRow): Record<string, unknown> {
  return {
    id: t.id,
    walletId: t.wallet_id,
    bookingId: t.booking_id,
    type: t.type,
    amount: Number(t.amount),
    balanceAfter: Number(t.balance_after),
    description: t.description,
    referenceId: t.reference_id,
    createdAt: t.created_at,
  };
}
