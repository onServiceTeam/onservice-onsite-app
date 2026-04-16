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
  });
}

export async function holdEscrow(
  walletId: string,
  amount: number,
  bookingId: string,
): Promise<void> {
  if (amount <= 0) throw createAppError('Escrow hold amount must be positive.', 400);

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, walletId],
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'escrow_hold', $3, (SELECT pending_balance FROM wallets WHERE id = $1), $4)`,
      [walletId, bookingId, amount, `Escrow hold for booking`],
    );
  });
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
