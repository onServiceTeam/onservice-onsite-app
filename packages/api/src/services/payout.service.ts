import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as walletService from './wallet.service';
import * as settingsService from './settings.service';
import { formatPHP } from '../utils/currency';

// MED-N78 fix: per-method destination account format validation.
// Without these, a typo in destinationAccount silently routes
// payment to the wrong recipient. The regexes match the canonical
// PH account formats:
//   - GCash / Maya: 11-digit phone (09XXXXXXXXX)
//   - InstaPay / PESONet: bank account number (8–16 digits)
const DESTINATION_FORMATS: Record<string, { regex: RegExp; help: string }> = {
  gcash: { regex: /^09\d{9}$/, help: 'GCash account must be an 11-digit PH mobile number (09XXXXXXXXX).' },
  maya: { regex: /^09\d{9}$/, help: 'Maya account must be an 11-digit PH mobile number (09XXXXXXXXX).' },
  bank_instapay: { regex: /^\d{8,16}$/, help: 'InstaPay bank account number must be 8–16 digits.' },
  bank_pesonet: { regex: /^\d{8,16}$/, help: 'PESONet bank account number must be 8–16 digits.' },
};

const LARGE_PAYOUT_REVIEW_DEFAULT_CENTAVOS = 50_000_000;
const LARGE_PAYOUT_REVIEW_MAX_CENTAVOS = 50_000_000;

export function validateDestinationAccount(method: string, account: string): void {
  const fmt = DESTINATION_FORMATS[method];
  if (!fmt) {
    throw createAppError(`Unknown payout method "${method}".`, 400);
  }
  if (!fmt.regex.test(account)) {
    throw createAppError(fmt.help, 400);
  }
}

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
  requires_aml_review?: boolean;
  aml_threshold_at_request_centavos?: string | number | null;
  // BUG-PHASE41-01 — populated by listPayouts via LEFT JOIN providers.
  // null when not populated by other queries (single-row formatters).
  provider_business_name?: string | null;
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
      `Minimum withdrawal is ${formatPHP(platformConfig.minimumWithdrawalAmount)}.`,
      400,
    );
  }

  // MED-N78: validate destination account format BEFORE we touch the
  // wallet so a typo can't decrement a balance and then bounce.
  validateDestinationAccount(data.method, data.destinationAccount);

  // MED-N77 / UX-184: internal large-transaction review threshold. The legacy
  // database names include "aml" for compatibility, but this control is not a
  // legal determination or reporting workflow. Read the current
  // admin-tunable threshold and hold a request at/above it for super_admin
  // review before disbursement. This is a conservative platform control, not
  // a legal determination that onService is a covered person or that this
  // payout is a reportable covered transaction. The configured value used at
  // request time is snapshotted for audit.
  let amlThresholdCentavos = LARGE_PAYOUT_REVIEW_DEFAULT_CENTAVOS;
  try {
    const configured = await settingsService.getSettingInteger('aml_large_transaction_threshold_centavos');
    if (!Number.isSafeInteger(configured)) {
      throw new Error('configured threshold is not a safe integer');
    }
    // The setting may make the control stricter, but never looser than the
    // conservative ₱500K ceiling without a separate compliance decision.
    amlThresholdCentavos = Math.min(
      LARGE_PAYOUT_REVIEW_MAX_CENTAVOS,
      Math.max(platformConfig.minimumWithdrawalAmount, configured),
    );
    if (amlThresholdCentavos !== configured) {
      logger.warn('Large-transaction review threshold was outside safe bounds and was clamped', {
        configured,
        effective: amlThresholdCentavos,
      });
    }
  } catch (err) {
    logger.warn('Large-transaction review threshold unavailable; using ₱500K fallback', {
      error: (err as Error).message,
    });
  }
  const requiresAmlReview = data.amount >= amlThresholdCentavos;

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

  return db.transaction(async (client) => {
    // Serialize withdrawal requests per provider. Without this lock, two
    // simultaneous requests could both pass the in-flight count before either
    // inserted its payout row.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [providerId]);
    const pendingResult = await client.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM payouts
        WHERE provider_id = $1
          AND status IN ('aml_review_pending', 'pending', 'processing', 'approved')`,
      [providerId],
    );
    if (Number(pendingResult.rows[0]?.count ?? 0) > 0) {
      throw createAppError('You already have a payout under review or processing. Please wait for it to complete.', 409);
    }

    const walletUpdate = await client.query(
      `UPDATE wallets SET available_balance = available_balance - $1, pending_balance = pending_balance + $1, updated_at = NOW()
       WHERE id = $2 AND available_balance >= $1`,
      [data.amount, wallet.id],
    );
    if (walletUpdate.rowCount === 0) {
      throw createAppError('Insufficient wallet balance.', 400);
    }

    // MED-N77 fix: large payouts enter the legacy-named
    // 'aml_review_pending' internal review status
    // with requires_aml_review=TRUE and a snapshot of the threshold
    // that triggered the flag.
    const status = requiresAmlReview ? 'aml_review_pending' : 'pending';
    const result = await client.query<PayoutRow>(
      `INSERT INTO payouts (
         provider_id, wallet_id, amount, method, destination_account,
         account_name, notes, status, requires_aml_review,
         aml_threshold_at_request_centavos
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        providerId, wallet.id, data.amount, data.method, data.destinationAccount,
        data.accountName ?? null, data.notes ?? null, status,
        requiresAmlReview, amlThresholdCentavos,
      ],
    );

    if (requiresAmlReview) {
      logger.warn('Payout held for internal large-transaction review', {
        payoutId: result.rows[0]!.id,
        providerId,
        amount: data.amount,
        thresholdCentavos: amlThresholdCentavos,
      });
    }

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, 'withdrawal', $2, (SELECT available_balance FROM wallets WHERE id = $1), $3, $4)`,
      [wallet.id, -data.amount, `Payout request via ${data.method}`, result.rows[0]!.id],
    );

    logger.info('Payout requested', { payoutId: result.rows[0]!.id, providerId, amount: data.amount });
    return result.rows[0]!;
  });
}

// MED-N77 fix: super_admin internal large-payout clearance step. A payout flagged at
// request time (status='aml_review_pending', requires_aml_review=TRUE)
// is held until super_admin clears it via this function. Clearance
// transitions the row to standard 'pending' status so the existing
// approvePayout / rejectPayout flow can take over. The decision is
// audited via admin_actions with action_type='aml_review_cleared'.
//
// Caller (routes layer) MUST gate this with rbacMiddleware('super_admin')
// because clearing the internal compliance control is a senior money action.
export async function clearAmlReview(payoutId: string, superAdminId: string, reason: string): Promise<PayoutRow> {
  return db.transaction(async (client) => {
    const result = await client.query<PayoutRow>(
      `UPDATE payouts SET status = 'pending', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND status = 'aml_review_pending' RETURNING *`,
      [superAdminId, payoutId],
    );
    if (result.rows.length === 0) {
      throw createAppError('Payout not found or not pending AML review.', 404);
    }

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'aml_review_cleared', 'payout', $2, $3, $4)`,
      [
        superAdminId,
        payoutId,
        JSON.stringify({
          amount: Number(result.rows[0]!.amount),
          method: result.rows[0]!.method,
          aml_threshold_at_request_centavos:
            result.rows[0]!.aml_threshold_at_request_centavos == null
              ? null
              : Number(result.rows[0]!.aml_threshold_at_request_centavos),
        }),
        reason,
      ],
    );

    logger.info('AML review cleared by super_admin', {
      payoutId,
      superAdminId,
      amount: Number(result.rows[0]!.amount),
    });
    return result.rows[0]!;
  });
}

export async function approvePayout(payoutId: string, adminId: string, reason: string): Promise<PayoutRow> {
  // Phase 14 Dispatch 06 — gate-promotion fix. Pre-D06 the payout
  // UPDATE + admin_actions INSERT + notifications INSERT ran as four
  // separate top-level db.query calls. If audit or notification failed
  // after status flipped to 'approved', payout state was committed
  // without audit. Now: ONE transaction wraps the status update,
  // admin_actions audit, and provider notification.
  return db.transaction(async (client) => {
    const result = await client.query<PayoutRow>(
      `UPDATE payouts SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND status = 'pending' RETURNING *`,
      [adminId, payoutId],
    );
    if (result.rows.length === 0) throw createAppError('Payout not found or not in pending status.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'payout_approved', 'payout', $2, $3, $4)`,
      [adminId, payoutId, JSON.stringify({ amount: Number(result.rows[0]!.amount) }), reason],
    );

    const prov = await client.query<{ user_id: string }>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [result.rows[0]!.provider_id],
    );
    if (prov.rows[0]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payout', 'Payout Approved', $2, $3)`,
        [
          prov.rows[0].user_id,
          `Your payout of ${formatPHP(Number(result.rows[0]!.amount))} has been approved and is being processed.`,
          JSON.stringify({ payoutId, amount: Number(result.rows[0]!.amount) }),
        ],
      );
    }

    logger.info('Payout approved', { payoutId, adminId });
    return result.rows[0]!;
  });
}

export async function rejectPayout(payoutId: string, adminId: string, reason: string): Promise<PayoutRow> {
  return db.transaction(async (client) => {
    const result = await client.query<PayoutRow>(
      `UPDATE payouts SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND status IN ('aml_review_pending', 'pending') RETURNING *`,
      [adminId, reason, payoutId],
    );
    if (result.rows.length === 0) {
      throw createAppError('Payout not found or not awaiting a decision.', 404);
    }
    const p = result.rows[0]!;

    const amount = Number(p.amount);
    const walletUpdate = await client.query(
      `UPDATE wallets
          SET available_balance = available_balance + $1,
              pending_balance = pending_balance - $1,
              updated_at = NOW()
        WHERE id = $2 AND pending_balance >= $1`,
      [amount, p.wallet_id],
    );
    if (walletUpdate.rowCount === 0) {
      // Roll back the payout status too. A rejected record must never claim
      // the provider's full amount was returned when the reservation is short.
      throw createAppError('Payout reservation is inconsistent. No funds were changed; Finance must investigate.', 409);
    }

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

    const prov = await client.query<{ user_id: string }>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [p.provider_id],
    );
    if (prov.rows[0]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payout', 'Payout Rejected', $2, $3)`,
        [
          prov.rows[0].user_id,
          `Your payout of ${formatPHP(amount)} was rejected. The reserved amount was returned to your available balance. Reason: ${reason}`,
          JSON.stringify({ payoutId, amount, reason }),
        ],
      );
    }

    logger.info('Payout rejected', { payoutId, adminId, reason });
    return result.rows[0]!;
  });
}

export async function completePayout(
  payoutId: string,
  adminId: string,
  reason: string,
  paymongoTransferId?: string,
): Promise<PayoutRow> {
  return db.transaction(async (client) => {
    const result = await client.query<PayoutRow>(
      `UPDATE payouts SET status = 'completed', completed_at = NOW(), paymongo_transfer_id = $1
       WHERE id = $2 AND status = 'approved' RETURNING *`,
      [paymongoTransferId ?? null, payoutId],
    );
    if (result.rows.length === 0) {
      throw createAppError('Payout not found or not approved.', 404);
    }
    const p = result.rows[0]!;
    const amount = Number(p.amount);

    const walletUpdate = await client.query(
      `UPDATE wallets SET pending_balance = pending_balance - $1, updated_at = NOW()
        WHERE id = $2 AND pending_balance >= $1`,
      [amount, p.wallet_id],
    );
    if (walletUpdate.rowCount === 0) {
      throw createAppError('Payout reservation is inconsistent. Completion was not recorded; Finance must investigate.', 409);
    }

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'payout_completed', 'payout', $2, $3, $4)`,
      [
        adminId,
        payoutId,
        JSON.stringify({ amount, method: p.method, transferId: paymongoTransferId ?? null }),
        reason,
      ],
    );

    const prov = await client.query<{ user_id: string }>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [p.provider_id],
    );
    if (prov.rows[0]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payout', 'Payout Sent', $2, $3)`,
        [
          prov.rows[0].user_id,
          `Your payout of ${formatPHP(amount)} has been sent to your ${p.method} account.`,
          JSON.stringify({ payoutId, amount, method: p.method }),
        ],
      );
    }

    logger.info('Payout completed', { payoutId, adminId, amount });
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
  // BUG-PHASE41-01 fix — JOIN providers so the admin payouts list can
  // show "{provider business name}" alongside the opaque providerId.
  // Pre-fix admins saw only "PA-12345678" with no indication of who.
  const dataResult = await db.query<PayoutRow>(
    `SELECT p.*, pr.business_name AS provider_business_name
     FROM payouts p
     LEFT JOIN providers pr ON pr.id = p.provider_id
     ${whereClause}
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
    requiresAmlReview: p.requires_aml_review ?? false,
    amlThresholdAtRequest:
      p.aml_threshold_at_request_centavos == null
        ? null
        : Number(p.aml_threshold_at_request_centavos),
    // BUG-PHASE41-01 — passthrough when listPayouts populated it.
    providerBusinessName: p.provider_business_name ?? null,
  };
}
