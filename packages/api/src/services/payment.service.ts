// Bug 1271 verified — native fetch only. CRIT-N14 fix: replaced axios with
// globalThis.fetch so this service follows the same wrapper rule as the rest
// of the codebase. Axios was the last remaining dependency on a third-party
// HTTP client in the API package.
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { formatPHP } from '../utils/currency';

interface PaymentIntentRow {
  id: string;
  booking_id: string;
  paymongo_intent_id: string | null;
  amount: string;
  payment_method: string;
  status: string;
  client_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

type PaymentMethod = 'gcash' | 'maya' | 'card' | 'qrph' | 'wallet' | 'bank_transfer';

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

  const result = await db.query<PaymentIntentRow>(
    `INSERT INTO payment_intents (booking_id, paymongo_intent_id, amount, payment_method, status, client_key)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [bookingId, paymongoIntentId, amount, paymentMethod, paymentMethod === 'wallet' ? 'processing' : 'awaiting_payment', clientKey],
  );

  logger.info('Payment intent created', { bookingId, amount, paymentMethod, intentId: paymongoIntentId });
  return result.rows[0]!;
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

export async function updatePaymentStatus(
  intentId: string,
  status: 'succeeded' | 'failed' | 'refunded' | 'partially_refunded',
  referenceId?: string,
): Promise<PaymentIntentRow> {
  const result = await db.query<PaymentIntentRow>(
    `UPDATE payment_intents SET status = $1, updated_at = NOW(),
       metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
     WHERE id = $2 RETURNING *`,
    [status, intentId, JSON.stringify({ reference_id: referenceId ?? null, updated: new Date().toISOString() })],
  );

  if (result.rows.length === 0) throw createAppError('Payment intent not found.', 404);

  logger.info('Payment status updated', { intentId, status });
  return result.rows[0]!;
}

export async function processRefund(
  bookingId: string,
  refundAmount: number,
  reason: string,
): Promise<void> {
  const intent = await getBookingPaymentIntent(bookingId);
  if (!intent) throw createAppError('No payment found for this booking.', 404);

  if (intent.status !== 'succeeded') {
    throw createAppError('Can only refund succeeded payments.', 409);
  }

  if (intent.paymongo_intent_id && !intent.paymongo_intent_id.startsWith('pi_sandbox_')) {
    try {
      const response = await globalThis.fetch(`${PAYMONGO_BASE}/refunds`, {
        method: 'POST',
        headers: { ...getPaymongoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: refundAmount,
              payment_id: intent.paymongo_intent_id,
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
        throw createAppError('Refund processing failed. Please contact support.', 502);
      }
    }
  }

  const newStatus = refundAmount >= Number(intent.amount) ? 'refunded' : 'partially_refunded';
  await updatePaymentStatus(intent.id, newStatus);
  logger.info('Refund processed', { bookingId, refundAmount, reason });
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
