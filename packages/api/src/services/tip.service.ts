import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as walletService from './wallet.service';
import { getSettingNumber } from './settings.service';
import { formatPHP } from '../utils/currency';

interface TipRow {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  amount: string;
  payment_method: string;
  status: string;
  message: string | null;
  created_at: Date;
}

interface CountRow { count: string }

export async function sendTip(
  customerId: string,
  data: {
    bookingId: string;
    amount: number;
    paymentMethod?: 'wallet' | 'gcash' | 'maya' | 'card';
    message?: string;
  },
): Promise<TipRow> {
  if (data.amount <= 0) throw createAppError('Tip amount must be positive.', 400);

  // Phase 14 Dispatch 05 — Bug 417.
  // Server-canonical tip cap from platform_settings (seeded by
  // migration 074, default ₱5,000). The schema enforces a hard ₱100K
  // sanity backstop; this enforces the dynamic operator-tunable max.
  const tipMaxCents = await getSettingNumber('tip_max_amount_cents');
  if (Number.isFinite(tipMaxCents) && tipMaxCents > 0 && data.amount > tipMaxCents) {
    throw createAppError(`Tip exceeds maximum of ${formatPHP(tipMaxCents)}.`, 400);
  }

  interface BookingRow {
    id: string;
    customer_id: string;
    provider_id: string | null;
    status: string;
  }
  const booking = await db.query<BookingRow>(
    `SELECT id, customer_id, provider_id, status FROM bookings WHERE id = $1`,
    [data.bookingId],
  );
  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (bk.customer_id !== customerId) throw createAppError('You are not the customer for this booking.', 403);

  if (!['completed_by_provider', 'confirmed', 'resolved'].includes(bk.status)) {
    throw createAppError('Tips can only be sent after job completion.', 409);
  }

  if (!bk.provider_id) throw createAppError('No provider assigned to this booking.', 409);

  const existingTip = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM tips WHERE booking_id = $1 AND customer_id = $2`,
    [data.bookingId, customerId],
  );
  if (Number(existingTip.rows[0]?.count ?? 0) > 0) {
    throw createAppError('You have already tipped for this booking.', 409);
  }

  const method = data.paymentMethod ?? 'wallet';

  // MED-N153 fix — restrict tipping to wallet method only for v1.0.
  // Pre-fix: gcash/maya/card tips were inserted as status='pending'
  // but no PayMongo intent was created, no webhook handler flipped
  // status to 'completed', and no provider notification fired —
  // pending tips accumulated forever and the provider never saw the
  // money. Post-fix: refuse non-wallet methods at the service layer
  // until v1.1 ships the PayMongo + webhook integration. Tracked
  // on LAUNCH-LIMITATIONS.
  if (method !== 'wallet') {
    throw createAppError(
      'Tips currently support wallet payment only. Please top up your wallet first.',
      400,
    );
  }

  // BUG-PHASE122-01 fix — pre-fix this transaction body had three
  // `if (method === 'wallet')` branches plus a
  // `method === 'wallet' ? 'completed' : 'pending'` ternary, all
  // dead after the MED-N153 gate above narrowed `method` to literal
  // 'wallet' for v1.0. The 'pending' branch in particular could
  // never run — every tip ships as 'completed'. Same dead-branch
  // pattern as Phases 103/107/110. Removing the dead conditionals
  // makes the wallet flow read straight-through and prevents a
  // future maintainer from re-enabling non-wallet paths by lifting
  // the MED-N153 gate without re-auditing the inside-of-trx logic
  // (which would silently regress the bug MED-N153 caught).
  return db.transaction(async (client) => {
    const wallet = await walletService.getUserWallet(customerId, 'customer');
    if (Number(wallet.available_balance) < data.amount) {
      throw createAppError('Insufficient wallet balance for tip.', 400);
    }
    const debit = await client.query(
      `UPDATE wallets SET available_balance = available_balance - $1, updated_at = NOW()
       WHERE id = $2 AND available_balance >= $1`,
      [data.amount, wallet.id],
    );
    // The balance read above isn't FOR UPDATE, so a concurrent tip could have
    // drained the wallet between the check and this guarded UPDATE. If the
    // guard matched 0 rows the debit didn't happen — abort the whole trx so we
    // never credit the provider / record a tip without actually charging.
    if (debit.rowCount === 0) {
      throw createAppError('Insufficient wallet balance for tip.', 400);
    }
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description)
       VALUES ($1, $2, 'payment', $3, (SELECT available_balance FROM wallets WHERE id = $1), 'Tip sent')`,
      [wallet.id, data.bookingId, -data.amount],
    );

    const result = await client.query<TipRow>(
      `INSERT INTO tips (booking_id, customer_id, provider_id, amount, payment_method, status, message)
       VALUES ($1, $2, $3, $4, 'wallet', 'completed', $5) RETURNING *`,
      [data.bookingId, customerId, bk.provider_id, data.amount, data.message ?? null],
    );
    const tip = result.rows[0]!;

    interface ProviderUserRow { user_id: string }
    const providerUser = await client.query<ProviderUserRow>(
      `SELECT user_id FROM providers WHERE id = $1`,
      [bk.provider_id],
    );
    if (providerUser.rows[0]) {
      const provWallet = await walletService.getUserWallet(providerUser.rows[0].user_id, 'provider');
      await client.query(
        `UPDATE wallets SET available_balance = available_balance + $1, updated_at = NOW() WHERE id = $2`,
        [data.amount, provWallet.id],
      );
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, booking_id, type, amount, balance_after, description, reference_id)
         VALUES ($1, $2, 'payment', $3, (SELECT available_balance FROM wallets WHERE id = $1), 'Tip received', $4)`,
        [provWallet.id, data.bookingId, data.amount, tip.id],
      );

      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payment', 'Tip Received!', $2, $3)`,
        [
          providerUser.rows[0].user_id,
          `You received a tip of ${formatPHP(data.amount)}${data.message ? `: "${data.message}"` : ''}`,
          JSON.stringify({ tipId: tip.id, bookingId: data.bookingId, amount: data.amount }),
        ],
      );
    }

    logger.info('Tip sent', { tipId: tip.id, bookingId: data.bookingId, amount: data.amount });
    return tip;
  });
}

export async function getTipsByBooking(bookingId: string): Promise<TipRow[]> {
  const result = await db.query<TipRow>(
    `SELECT * FROM tips WHERE booking_id = $1 ORDER BY created_at DESC`,
    [bookingId],
  );
  return result.rows;
}

export async function getMyTips(
  userId: string,
  role: 'customer' | 'provider',
  page = 1,
  pageSize = 20,
): Promise<{ tips: TipRow[]; total: number }> {
  const column = role === 'customer' ? 'customer_id' : 'provider_id';
  let filterValue = userId;

  if (role === 'provider') {
    interface ProviderRow { id: string }
    const prov = await db.query<ProviderRow>(`SELECT id FROM providers WHERE user_id = $1`, [userId]);
    if (prov.rows.length === 0) throw createAppError('Provider not found.', 404);
    filterValue = prov.rows[0]!.id;
  }

  const offset = (page - 1) * pageSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM tips WHERE ${column} = $1`,
      [filterValue],
    ),
    db.query<TipRow>(
      `SELECT * FROM tips WHERE ${column} = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [filterValue, pageSize, offset],
    ),
  ]);

  return { tips: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export function formatTip(t: TipRow): Record<string, unknown> {
  return {
    id: t.id,
    bookingId: t.booking_id,
    customerId: t.customer_id,
    providerId: t.provider_id,
    amount: Number(t.amount),
    paymentMethod: t.payment_method,
    status: t.status,
    message: t.message,
    createdAt: t.created_at,
  };
}
