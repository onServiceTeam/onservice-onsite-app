import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as walletService from './wallet.service';

interface PayoutRow {
  id: string;
  provider_id: string;
  wallet_id: string;
  amount: string;
  method: string;
  destination_account: string;
  account_name: string | null;
  status: string;
  paymongo_transfer_id: string | null;
  failure_reason: string | null;
  rejection_reason: string | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  completed_at: Date | null;
}

interface CountRow { count: string }

export async function requestPayout(
  providerUserId: string,
  data: {
    amount: number;
    method: 'gcash' | 'maya' | 'bank_instapay' | 'bank_pesonet';
    destinationAccount: string;
    accountName?: string;
    notes?: string;
  },
): Promise<PayoutRow> {
  if (data.amount < platformConfig.minimumWithdrawalAmount) {
    throw createAppError(
      `Minimum withdrawal is ${platformConfig.currencySymbol}${(platformConfig.minimumWithdrawalAmount / 100).toFixed(2)}.`,
      400,
    );
  }

  interface ProviderRow { id: string }
  const providerResult = await db.query<ProviderRow>(
    `SELECT id FROM providers WHERE user_id = $1 AND status = 'approved'`,
    [providerUserId],
  );
  if (providerResult.rows.length === 0) {
    throw createAppError('Provider not found or not approved.', 404);
  }
  const providerId = providerResult.rows[0]!.id;

  const wallet = await walletService.getUserWallet(providerUserId, 'provider');

  if (Number(wallet.available_balance) < data.amount) {
    throw createAppError('Insufficient wallet balance.', 400);
  }

  const pendingResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM payouts WHERE provider_id = $1 AND status IN ('pending', 'processing', 'approved')`,
    [providerId],
  );
  if (Number(pendingResult.rows[0]?.count ?? 0) > 0) {
    throw createAppError('You already have a pending or processing payout. Please wait for it to complete.', 409);
  }

  return db.transaction(async (client) => {
    const walletUpdate = await client.query(
      `UPDATE wallets SET available_balance = available_balance - $1, pending_balance = pending_balance + $1, updated_at = NOW()
       WHERE id = $2 AND available_balance >= $1`,
      [data.amount, wallet.id],
    );
    if (walletUpdate.rowCount === 0) {
      throw createAppError('Insufficient wallet balance.', 400);
    }

    const result = await client.query<PayoutRow>(
      `INSERT INTO payouts (provider_id, wallet_id, amount, method, destination_account, account_name, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
      [providerId, wallet.id, data.amount, data.method, data.destinationAccount, data.accountName ?? null, data.notes ?? null],
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, 'withdrawal', $2, (SELECT available_balance FROM wallets WHERE id = $1), $3, $4)`,
      [wallet.id, -data.amount, `Payout request via ${data.method}`, result.rows[0]!.id],
    );

    logger.info('Payout requested', { payoutId: result.rows[0]!.id, providerId, amount: data.amount });
    return result.rows[0]!;
  });
}

export async function approvePayout(payoutId: string, adminId: string): Promise<PayoutRow> {
  const result = await db.query<PayoutRow>(
    `UPDATE payouts SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
     WHERE id = $2 AND status = 'pending' RETURNING *`,
    [adminId, payoutId],
  );
  if (result.rows.length === 0) throw createAppError('Payout not found or not in pending status.', 404);

  await db.query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
     VALUES ($1, 'payout_approved', 'payout', $2, $3)`,
    [adminId, payoutId, JSON.stringify({ amount: Number(result.rows[0]!.amount) })],
  );

  const prov = await db.query<{ user_id: string }>(
    `SELECT user_id FROM providers WHERE id = $1`,
    [result.rows[0]!.provider_id],
  );
  if (prov.rows[0]) {
    const amt = (Number(result.rows[0]!.amount) / 100).toFixed(2);
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'payout', 'Payout Approved', $2, $3)`,
      [
        prov.rows[0].user_id,
        `Your payout of ₱${amt} has been approved and is being processed.`,
        JSON.stringify({ payoutId, amount: Number(result.rows[0]!.amount) }),
      ],
    );
  }

  logger.info('Payout approved', { payoutId, adminId });
  return result.rows[0]!;
}

export async function rejectPayout(payoutId: string, adminId: string, reason: string): Promise<PayoutRow> {
  const payout = await db.query<PayoutRow>(
    `SELECT * FROM payouts WHERE id = $1 AND status = 'pending'`,
    [payoutId],
  );
  if (payout.rows.length === 0) throw createAppError('Payout not found or not in pending status.', 404);
  const p = payout.rows[0]!;

  return db.transaction(async (client) => {
    const result = await client.query<PayoutRow>(
      `UPDATE payouts SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
       WHERE id = $3 RETURNING *`,
      [adminId, reason, payoutId],
    );

    await client.query(
      `UPDATE wallets SET available_balance = available_balance + $1, pending_balance = pending_balance - $1, updated_at = NOW()
       WHERE id = $2`,
      [Number(p.amount), p.wallet_id],
    );

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, 'withdrawal', $2, (SELECT available_balance FROM wallets WHERE id = $1), $3, $4)`,
      [p.wallet_id, Number(p.amount), 'Payout rejected — funds returned', payoutId],
    );

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'payout_rejected', 'payout', $2, $3, $4)`,
      [adminId, payoutId, JSON.stringify({ amount: Number(p.amount) }), reason],
    );

    logger.info('Payout rejected', { payoutId, adminId, reason });
    return result.rows[0]!;
  });
}

export async function completePayout(payoutId: string, paymongoTransferId?: string): Promise<PayoutRow> {
  const payout = await db.query<PayoutRow>(
    `SELECT * FROM payouts WHERE id = $1 AND status = 'approved'`,
    [payoutId],
  );
  if (payout.rows.length === 0) throw createAppError('Payout not found or not approved.', 404);
  const p = payout.rows[0]!;

  return db.transaction(async (client) => {
    const result = await client.query<PayoutRow>(
      `UPDATE payouts SET status = 'completed', completed_at = NOW(), paymongo_transfer_id = $1
       WHERE id = $2 RETURNING *`,
      [paymongoTransferId ?? null, payoutId],
    );

    await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW() WHERE id = $2`,
      [Number(p.amount), p.wallet_id],
    );

    const prov = await client.query<{ user_id: string }>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [p.provider_id],
    );
    if (prov.rows[0]) {
      const amt = (Number(p.amount) / 100).toFixed(2);
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payout', 'Payout Sent', $2, $3)`,
        [
          prov.rows[0].user_id,
          `Your payout of ₱${amt} has been sent to your ${p.method} account.`,
          JSON.stringify({ payoutId, amount: Number(p.amount), method: p.method }),
        ],
      );
    }

    logger.info('Payout completed', { payoutId, amount: Number(p.amount) });
    return result.rows[0]!;
  });
}

export async function listPayouts(
  filters: { providerId?: string; status?: string; page: number; pageSize: number },
): Promise<{ payouts: PayoutRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.providerId) {
    conditions.push(`p.provider_id = $${paramIdx++}`);
    params.push(filters.providerId);
  }
  if (filters.status) {
    conditions.push(`p.status = $${paramIdx++}`);
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM payouts p ${whereClause}`,
    params,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<PayoutRow>(
    `SELECT p.* FROM payouts p ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { payouts: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function getMyPayouts(
  providerUserId: string,
  filters: { status?: string; page: number; pageSize: number },
): Promise<{ payouts: PayoutRow[]; total: number }> {
  interface ProviderRow { id: string }
  const provider = await db.query<ProviderRow>(
    `SELECT id FROM providers WHERE user_id = $1`,
    [providerUserId],
  );
  if (provider.rows.length === 0) throw createAppError('Provider not found.', 404);
  return listPayouts({ providerId: provider.rows[0]!.id, ...filters });
}

export async function getPayoutById(payoutId: string): Promise<PayoutRow> {
  const result = await db.query<PayoutRow>(`SELECT * FROM payouts WHERE id = $1`, [payoutId]);
  if (result.rows.length === 0) throw createAppError('Payout not found.', 404);
  return result.rows[0]!;
}

export function formatPayout(p: PayoutRow): Record<string, unknown> {
  return {
    id: p.id,
    providerId: p.provider_id,
    walletId: p.wallet_id,
    amount: Number(p.amount),
    method: p.method,
    destinationAccount: p.destination_account,
    accountName: p.account_name,
    status: p.status,
    paymongoTransferId: p.paymongo_transfer_id,
    failureReason: p.failure_reason,
    rejectionReason: p.rejection_reason,
    notes: p.notes,
    reviewedBy: p.reviewed_by,
    reviewedAt: p.reviewed_at,
    createdAt: p.created_at,
    completedAt: p.completed_at,
  };
}
