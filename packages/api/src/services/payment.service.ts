import axios from 'axios';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

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

function getPaymongoHeaders() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) {
    logger.warn('PAYMONGO_SECRET_KEY not set — using sandbox mode');
    return { Authorization: 'Basic ' + Buffer.from('sk_test_placeholder:').toString('base64') };
  }
  return { Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') };
}

export async function createPaymentIntent(
  bookingId: string,
  amount: number,
  paymentMethod: PaymentMethod,
  description: string,
): Promise<PaymentIntentRow> {
  if (amount < 10000) {
    throw createAppError('Minimum payment amount is ₱100.00.', 400);
  }

  let paymongoIntentId: string | null = null;
  let clientKey: string | null = null;

  if (paymentMethod !== 'wallet') {
    try {
      const response = await axios.post(
        `${PAYMONGO_BASE}/payment_intents`,
        {
          data: {
            attributes: {
              amount,
              payment_method_allowed: mapPaymentMethodToPaymongo(paymentMethod),
              currency: 'PHP',
              description,
              metadata: { booking_id: bookingId },
            },
          },
        },
        { headers: { ...getPaymongoHeaders(), 'Content-Type': 'application/json' } },
      );

      paymongoIntentId = response.data?.data?.id ?? null;
      clientKey = response.data?.data?.attributes?.client_key ?? null;
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
      await axios.post(
        `${PAYMONGO_BASE}/refunds`,
        {
          data: {
            attributes: {
              amount: refundAmount,
              payment_id: intent.paymongo_intent_id,
              reason: 'requested_by_customer',
              notes: reason,
            },
          },
        },
        { headers: { ...getPaymongoHeaders(), 'Content-Type': 'application/json' } },
      );
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

export function formatPaymentIntent(p: PaymentIntentRow) {
  return {
    id: p.id,
    bookingId: p.booking_id,
    paymongoIntentId: p.paymongo_intent_id,
    amount: Number(p.amount),
    paymentMethod: p.payment_method,
    status: p.status,
    clientKey: p.client_key,
    createdAt: p.created_at,
  };
}
