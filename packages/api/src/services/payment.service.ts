// Bug 1271 verified — native fetch only. CRIT-N14 fix: replaced axios with
// globalThis.fetch so this service follows the same wrapper rule as the rest
// of the codebase. Axios was the last remaining dependency on a third-party
// HTTP client in the API package.
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { formatPHP } from '../utils/currency';

export interface PaymentIntentRow {
  id: string;
  booking_id: string;
  paymongo_intent_id: string | null;
  /** Phase B CRIT-02 fix — captured from payment.paid webhook (mig 114). */
  paymongo_payment_id?: string | null;
  amount: string;
  /** Phase B CRIT-01 fix — cumulative refunded centavos (mig 114). */
  refunded_amount?: string | number;
  payment_method: string;
  status: string;
  client_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

type PaymentMethod = 'gcash' | 'maya' | 'card' | 'qrph' | 'wallet' | 'bank_transfer';

import type { QueryResult, QueryResultRow } from 'pg';
type PgClient = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
};

const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

function getPaymongoHeaders(): Record<string, string> {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.warn('PAYMONGO_SECRET_KEY not set — payment calls will fail in production');
      return { Authorization: 'Basic ' + Buffer.from('sk_test_missing:').toString('base64') };
    }
    throw new Error('PAYMONGO_SECRET_KEY environment variable is required in production');
  }
  return { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') };
}

export async function createPaymentIntent(
  bookingId: string,
  amount: number,
  paymentMethod: PaymentMethod,
  description: string,
  // MED-N157 fix — caller can mark this intent as a non-booking flow
  // (e.g., wallet top-up) so the webhook handler routes it correctly
  // via metadata.intent_kind instead of sniffing the booking_id prefix.
  intentKind: 'booking' | 'top_up' = 'booking',
): Promise<PaymentIntentRow> {
  if (amount < platformConfig.minimumPaymentAmount) {
    throw createAppError(`Minimum payment amount is ${formatPHP(platformConfig.minimumPaymentAmount)}.`, 400);
  }

  let paymongoIntentId: string | null = null;
  let clientKey: string | null = null;

  if (paymentMethod !== 'wallet') {
    try {
      const response = await globalThis.fetch(`${PAYMONGO_BASE}/payment_intents`, {
        method: 'POST',
        headers: { ...getPaymongoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            attributes: {
              amount,
              payment_method_allowed: mapPaymentMethodToPaymongo(paymentMethod),
              currency: 'PHP',
              description,
              metadata: { booking_id: bookingId, intent_kind: intentKind },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`PayMongo returned status ${response.status}`);
      }

      const responseData = (await response.json()) as {
        data?: { id?: string; attributes?: { client_key?: string } };
      };

      paymongoIntentId = responseData.data?.id ?? null;
      clientKey = responseData.data?.attributes?.client_key ?? null;
    } catch (err) {
      logger.error('PayMongo payment intent creation failed', {
        bookingId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });

      if (process.env.NODE_ENV === 'production') {
        throw createAppError('Payment service temporarily unavailable. Please try again.', 502);
      }
      paymongoIntentId = `pi_sandbox_${Date.now()}`;
      clientKey = `client_sandbox_${Date.now()}`;
    }
  }

  // BUG-PHASE27-01 fix: when intentKind='top_up', the caller passes a
  // string topUpId of form 'topup_<userId>_<ts>' as `bookingId`. That
  // doesn't fit `payment_intents.booking_id uuid`. Migration 122 added
  // `topup_id text` and made `booking_id` nullable; route to the right
  // column based on intentKind. metadata.booking_id retains the topUpId
  // (back-compat with the webhook handler which reads from metadata).
  const isTopUp = intentKind === 'top_up';
  const result = await db.query<PaymentIntentRow>(
    `INSERT INTO payment_intents
       (booking_id, topup_id, paymongo_intent_id, amount, payment_method, status, client_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING *`,
    [
      isTopUp ? null : bookingId,
      isTopUp ? bookingId : null,
      paymongoIntentId,
      amount,
      paymentMethod,
      paymentMethod === 'wallet' ? 'processing' : 'awaiting_payment',
      clientKey,
      JSON.stringify({ booking_id: bookingId, intent_kind: intentKind }),
    ],
  );

  logger.info('Payment intent created', { bookingId, amount, paymentMethod, intentId: paymongoIntentId, intentKind });
  return result.rows[0]!;
}

/**
 * Create the local wallet payment record on a caller-owned transaction.
 * Wallet payments never call PayMongo, so inserting this row alongside the
 * booking lock, wallet debit, and escrow hold closes the partial-commit gap in
 * the route's previous implementation.
 */
export async function createWalletPaymentIntentInTransaction(
  client: PgClient,
  bookingId: string,
  amount: number,
): Promise<PaymentIntentRow> {
  if (amount < platformConfig.minimumPaymentAmount) {
    throw createAppError(`Minimum payment amount is ${formatPHP(platformConfig.minimumPaymentAmount)}.`, 400);
  }

  const result = await client.query<PaymentIntentRow>(
    `INSERT INTO payment_intents
       (booking_id, topup_id, paymongo_intent_id, amount, payment_method, status, client_key, metadata)
     VALUES ($1, NULL, NULL, $2, 'wallet', 'processing', NULL, $3::jsonb)
     RETURNING *`,
    [bookingId, amount, JSON.stringify({ booking_id: bookingId, intent_kind: 'booking' })],
  );
  const intent = result.rows[0];
  if (!intent) throw createAppError('Wallet payment record could not be created.', 500);
  logger.info('Wallet payment intent created', { bookingId, amount, intentId: intent.id });
  return intent;
}

export async function getPaymentIntent(intentId: string): Promise<PaymentIntentRow> {
  const result = await db.query<PaymentIntentRow>(
    `SELECT * FROM payment_intents WHERE id = $1`,
    [intentId],
  );
  if (result.rows.length === 0) throw createAppError('Payment intent not found.', 404);
  return result.rows[0]!;
}

export async function getBookingPaymentIntent(bookingId: string): Promise<PaymentIntentRow | null> {
  const result = await db.query<PaymentIntentRow>(
    `SELECT * FROM payment_intents WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [bookingId],
  );
  return result.rows[0] ?? null;
}

// BUG-PHASE27-01 — webhook handler routes topup events through here
// (string topUpId, not uuid booking_id). See migration 122.
export async function getTopupPaymentIntent(topupId: string): Promise<PaymentIntentRow | null> {
  const result = await db.query<PaymentIntentRow>(
    `SELECT * FROM payment_intents WHERE topup_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [topupId],
  );
  return result.rows[0] ?? null;
}

export async function updatePaymentStatus(
  intentId: string,
  status: 'succeeded' | 'failed' | 'refunded' | 'partially_refunded',
  referenceId?: string,
): Promise<PaymentIntentRow> {
  // Phase B CRIT-02 fix — when the webhook hands us a PayMongo
  // payment ID (pay_XYZ), write it to the dedicated paymongo_payment_id
  // column (added by mig 114) so the refund path can find it without
  // parsing JSON metadata. Pre-mig-114 the column doesn't exist yet;
  // the COALESCE-style write is defensive: we attempt the column
  // update inside try/catch and fall back to metadata-only on
  // undefined_column (42703) so the webhook handler stays green during
  // rolling deploys.
  const isPaymongoPaymentId = typeof referenceId === 'string' && referenceId.startsWith('pay_');
  try {
    const result = await db.query<PaymentIntentRow>(
      `UPDATE payment_intents
          SET status = $1,
              updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
              paymongo_payment_id = COALESCE($4, paymongo_payment_id)
        WHERE id = $2 RETURNING *`,
      [
        status,
        intentId,
        JSON.stringify({ reference_id: referenceId ?? null, updated: new Date().toISOString() }),
        isPaymongoPaymentId ? referenceId : null,
      ],
    );
    if (result.rows.length === 0) throw createAppError('Payment intent not found.', 404);
    logger.info('Payment status updated', { intentId, status });
    return result.rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === '42703') {
      // Column doesn't exist yet (mig 114 not applied). Fall back to
      // the original metadata-only write.
      const fallback = await db.query<PaymentIntentRow>(
        `UPDATE payment_intents SET status = $1, updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
         WHERE id = $2 RETURNING *`,
        [status, intentId, JSON.stringify({ reference_id: referenceId ?? null, updated: new Date().toISOString() })],
      );
      if (fallback.rows.length === 0) throw createAppError('Payment intent not found.', 404);
      logger.info('Payment status updated (pre-mig-114 fallback)', { intentId, status });
      return fallback.rows[0]!;
    }
    throw err;
  }
}

/**
 * Transaction-aware status update for webhook money paths. Production has
 * migration 114, so the dedicated PayMongo payment id is required here; this
 * helper deliberately has no pre-migration fallback that could escape the
 * caller's transaction.
 */
export async function updatePaymentStatusInTransaction(
  client: PgClient,
  intentId: string,
  status: 'succeeded' | 'failed' | 'refunded' | 'partially_refunded',
  referenceId?: string,
): Promise<PaymentIntentRow> {
  const paymongoPaymentId = typeof referenceId === 'string' && referenceId.startsWith('pay_')
    ? referenceId
    : null;
  const result = await client.query<PaymentIntentRow>(
    `UPDATE payment_intents
        SET status = $1,
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            paymongo_payment_id = COALESCE($4, paymongo_payment_id)
      WHERE id = $2 RETURNING *`,
    [
      status,
      intentId,
      JSON.stringify({ reference_id: referenceId ?? null, updated: new Date().toISOString() }),
      paymongoPaymentId,
    ],
  );
  if (result.rows.length === 0) throw createAppError('Payment intent not found.', 404);
  return result.rows[0]!;
}

/**
 * Phase B CRIT-01 + CRIT-02 fix.
 *
 * Pre-fix:
 *   - Status check rejected any refund when status != 'succeeded'.
 *     A second partial refund (legitimate use case) returned 409.
 *   - PayMongo refund POST sent the INTENT id (pi_XYZ) as
 *     `payment_id`. PayMongo expects the PAYMENT id (pay_XYZ) which
 *     comes from the payment.paid webhook. Production refunds were
 *     failing silently (caught + logged + swallowed in non-prod).
 *
 * Post-fix:
 *   - Allow status in ('succeeded', 'partially_refunded').
 *   - Track cumulative refunded_amount (mig 114). Reject if the new
 *     refund would push cumulative > intent.amount.
 *   - Use the PayMongo payment ID captured from the webhook
 *     (paymongo_payment_id column post-mig-114; falls back to
 *     metadata.reference_id for in-flight rows pre-migration).
 *   - On success: UPDATE refunded_amount AND status atomically.
 *     status = 'refunded' if cumulative === amount, else
 *     'partially_refunded'.
 */
export async function processRefund(
  bookingId: string,
  refundAmount: number,
  reason: string,
): Promise<void> {
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    throw createAppError('refundAmount must be a positive integer (centavos).', 400);
  }

  // §35b fix — serialize refunds for one booking and re-validate the
  // cumulative cap at WRITE time under a row lock. Pre-fix this read
  // refunded_amount, called PayMongo, then UPDATEd with no transaction or
  // lock, so two concurrent refunds for the same booking could both pass
  // the cap check and both call PayMongo / double-record. Now we lock the
  // booking's payment_intent row FOR UPDATE, validate, call PayMongo while
  // holding the lock, then UPDATE+commit; if PayMongo fails (prod) the trx
  // rolls back so no partial state is recorded. Refunds are admin-driven
  // and low-volume, so holding the row lock across the PayMongo call is
  // acceptable and avoids orphaned-claim states on crash.
  await db.transaction(async (client) => {
    // Lock the same row getBookingPaymentIntent would have returned.
    const intentResult = await client.query<PaymentIntentRow>(
      `SELECT * FROM payment_intents
         WHERE booking_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
      [bookingId],
    );
    const intent = intentResult.rows[0];
    if (!intent) throw createAppError('No payment found for this booking.', 404);

    // CRIT-01 — accept either succeeded or partially_refunded.
    if (intent.status !== 'succeeded' && intent.status !== 'partially_refunded') {
      throw createAppError(
        `Can only refund payments in status 'succeeded' or 'partially_refunded' (current: ${intent.status}).`,
        409,
      );
    }

    // CRIT-01 — cumulative refunded check, re-evaluated under the lock so a
    // concurrent refund that committed first is reflected here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentRefunded = Number((intent as any).refunded_amount ?? 0);
    const intentAmount = Number(intent.amount);
    const newCumulative = currentRefunded + refundAmount;
    if (newCumulative > intentAmount) {
      throw createAppError(
        `Refund amount ${refundAmount} would exceed remaining refundable balance (already refunded: ${currentRefunded}, intent total: ${intentAmount}).`,
        400,
      );
    }

    // CRIT-02 — get the actual PayMongo payment ID (pay_XYZ) for the
    // refund call. paymongo_payment_id column populated from the
    // payment.paid webhook (post-mig-114 + webhook fix). Fall back to
    // metadata.reference_id for in-flight rows before the column lands.
    const paymongoPaymentId: string | null =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (intent as any).paymongo_payment_id ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (intent.metadata as any)?.reference_id ??
      null;

    // Skip PayMongo call for sandbox intents and intents with no captured
    // payment id (sandbox / test fixtures / pre-mig rows).
    const shouldCallPayMongo =
      paymongoPaymentId !== null &&
      paymongoPaymentId.startsWith('pay_') &&
      !paymongoPaymentId.includes('sandbox');

    if (shouldCallPayMongo) {
      try {
        const response = await globalThis.fetch(`${PAYMONGO_BASE}/refunds`, {
          method: 'POST',
          headers: { ...getPaymongoHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              attributes: {
                amount: refundAmount,
                // CRIT-02 — use the PAYMENT id, not the intent id.
                payment_id: paymongoPaymentId,
                reason: 'requested_by_customer',
                notes: reason,
              },
            },
          }),
        });
        if (!response.ok) {
          throw new Error(`PayMongo refund returned status ${response.status}`);
        }
      } catch (err) {
        logger.error('PayMongo refund failed', { bookingId, error: err instanceof Error ? err.message : 'Unknown' });
        if (process.env.NODE_ENV === 'production') {
          // Roll back the whole trx (the UPDATE below never runs) so the
          // intent is not recorded as refunded when no money moved.
          throw createAppError('Refund processing failed. Please contact support.', 502);
        }
      }
    } else if (paymongoPaymentId === null && process.env.NODE_ENV === 'production') {
      // Production should always have a payment id by the time refund
      // runs (the webhook captures it on payment.paid). If we get here
      // in prod, log loudly but don't block the refund — the customer
      // still gets the wallet credit; we just need ops to reconcile
      // with PayMongo manually.
      logger.error('Refund attempted without PayMongo payment ID — manual reconciliation required', {
        bookingId,
        intentId: intent.id,
        paymongoIntentId: intent.paymongo_intent_id,
      });
    }

    const finalStatus = newCumulative >= intentAmount ? 'refunded' : 'partially_refunded';

    // Atomic UPDATE — both fields move together, under the same lock.
    await client.query(
      `UPDATE payment_intents
          SET status = $1,
              refunded_amount = $2,
              updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
        WHERE id = $3`,
      [
        finalStatus,
        newCumulative,
        intent.id,
        JSON.stringify({
          last_refund_at: new Date().toISOString(),
          last_refund_amount: refundAmount,
          last_refund_reason: reason,
        }),
      ],
    );

    logger.info('Refund processed', {
      bookingId,
      refundAmount,
      cumulativeRefunded: newCumulative,
      intentAmount,
      finalStatus,
    });
  });
}

function mapPaymentMethodToPaymongo(method: PaymentMethod): string[] {
  const map: Record<string, string[]> = {
    gcash: ['gcash'],
    maya: ['paymaya'],
    card: ['card'],
    qrph: ['qrph'],
    bank_transfer: ['dob'],
  };
  return map[method] ?? ['card'];
}

export function formatPaymentIntent(p: PaymentIntentRow): Record<string, unknown> {
  let checkoutUrl: string | null = null;
  if (p.payment_method !== 'wallet' && p.client_key) {
    checkoutUrl = buildCheckoutUrl(p.client_key, p.payment_method);
  }

  return {
    id: p.id,
    bookingId: p.booking_id,
    paymongoIntentId: p.paymongo_intent_id,
    amount: Number(p.amount),
    currency: 'PHP',
    paymentMethod: p.payment_method,
    status: p.status,
    clientKey: p.client_key,
    checkoutUrl,
    createdAt: p.created_at,
  };
}

function buildCheckoutUrl(clientKey: string, paymentMethod: string): string {
  const base = process.env.PAYMONGO_CHECKOUT_BASE ?? 'https://checkout.paymongo.com';
  return `${base}/intent/${encodeURIComponent(clientKey)}?method=${encodeURIComponent(paymentMethod)}`;
}
