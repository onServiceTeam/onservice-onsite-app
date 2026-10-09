import type { QueryResultRow } from 'pg';

import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import {
  reviewLegacyBookingFinancialTerms,
  type BookingFinancialTerms,
  type LegacyFinancialReviewRequest,
} from './booking-financial-terms.service';

interface LegacyQueueRow extends QueryResultRow {
  booking_id: string;
  status: string;
  escrow_status: string;
  customer_id: string;
  customer_name: string;
  provider_id: string | null;
  provider_name: string | null;
  current_provider_tier: string | null;
  category_name: string;
  service_name: string;
  service_price: string | number;
  service_fee: string | number;
  total_amount: string | number;
  payment_method: string | null;
  payment_intent_id: string | null;
  scheduled_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface LegacyFinancialReviewQueueItem {
  bookingId: string;
  status: string;
  escrowStatus: string;
  customerId: string;
  customerName: string;
  providerId: string | null;
  providerName: string | null;
  currentProviderTier: string | null;
  categoryName: string;
  serviceName: string;
  servicePriceCentavos: number;
  serviceFeeCentavos: number;
  totalAmountCentavos: number;
  paymentMethod: string | null;
  bookingPaymentIntentId: string | null;
  scheduledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function mapQueueItem(row: LegacyQueueRow): LegacyFinancialReviewQueueItem {
  return {
    bookingId: row.booking_id,
    status: row.status,
    escrowStatus: row.escrow_status,
    customerId: row.customer_id,
    customerName: row.customer_name,
    providerId: row.provider_id,
    providerName: row.provider_name,
    currentProviderTier: row.current_provider_tier,
    categoryName: row.category_name,
    serviceName: row.service_name,
    servicePriceCentavos: Number(row.service_price),
    serviceFeeCentavos: Number(row.service_fee),
    totalAmountCentavos: Number(row.total_amount),
    paymentMethod: row.payment_method,
    bookingPaymentIntentId: row.payment_intent_id,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const QUEUE_SELECT = `
  SELECT queue.*,
         NULLIF(TRIM(CONCAT_WS(' ', customer.first_name, customer.last_name)), '') AS customer_name,
         NULLIF(TRIM(COALESCE(provider.business_name,
           CONCAT_WS(' ', provider_user.first_name, provider_user.last_name))), '') AS provider_name,
         category.name AS category_name,
         COALESCE(subcategory.name, category.name) AS service_name,
         booking.scheduled_at
    FROM booking_financial_terms_legacy_queue queue
    JOIN bookings booking ON booking.id = queue.booking_id
    JOIN users customer ON customer.id = queue.customer_id
    LEFT JOIN providers provider ON provider.id = queue.provider_id
    LEFT JOIN users provider_user ON provider_user.id = provider.user_id
    JOIN service_categories category ON category.id = booking.category_id
    LEFT JOIN service_subcategories subcategory ON subcategory.id = booking.subcategory_id`;

export async function listLegacyFinancialReviews(
  limit = 25,
  offset = 0,
  search = '',
): Promise<{ items: LegacyFinancialReviewQueueItem[]; total: number }> {
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;
  const normalizedSearch = search.trim().slice(0, 200);
  const rowFilter = `
    WHERE ($3 = ''
      OR queue.booking_id::text ILIKE '%' || $3 || '%'
      OR customer.email ILIKE '%' || $3 || '%'
      OR CONCAT_WS(' ', customer.first_name, customer.last_name) ILIKE '%' || $3 || '%'
      OR COALESCE(provider.business_name, '') ILIKE '%' || $3 || '%'
      OR CONCAT_WS(' ', provider_user.first_name, provider_user.last_name) ILIKE '%' || $3 || '%')`;
  const countFilter = `
    WHERE ($1 = ''
      OR queue.booking_id::text ILIKE '%' || $1 || '%'
      OR customer.email ILIKE '%' || $1 || '%'
      OR CONCAT_WS(' ', customer.first_name, customer.last_name) ILIKE '%' || $1 || '%'
      OR COALESCE(provider.business_name, '') ILIKE '%' || $1 || '%'
      OR CONCAT_WS(' ', provider_user.first_name, provider_user.last_name) ILIKE '%' || $1 || '%')`;
  const [rows, count] = await Promise.all([
    db.query<LegacyQueueRow>(
      `${QUEUE_SELECT} ${rowFilter}
       ORDER BY queue.created_at ASC, queue.booking_id ASC
       LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset, normalizedSearch],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM booking_financial_terms_legacy_queue queue
         JOIN users customer ON customer.id = queue.customer_id
         LEFT JOIN providers provider ON provider.id = queue.provider_id
         LEFT JOIN users provider_user ON provider_user.id = provider.user_id
        ${countFilter}`,
      [normalizedSearch],
    ),
  ]);
  return {
    items: rows.rows.map(mapQueueItem),
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function getLegacyFinancialReview(bookingId: string): Promise<{
  booking: LegacyFinancialReviewQueueItem;
  paymentIntents: Array<Record<string, unknown>>;
  walletTransactions: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
}> {
  const bookingResult = await db.query<LegacyQueueRow>(
    `${QUEUE_SELECT} WHERE queue.booking_id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Legacy financial review item not found.', 404);
  const [paymentIntents, walletTransactions, quotes] = await Promise.all([
    db.query(
      `SELECT id, paymongo_intent_id, paymongo_payment_id, amount, payment_method,
              status, created_at, updated_at
         FROM payment_intents
        WHERE booking_id = $1
        ORDER BY created_at ASC`,
      [bookingId],
    ),
    db.query(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.description,
              wt.reference_id, wallet.type AS wallet_type, wt.created_at
         FROM wallet_transactions wt
         JOIN wallets wallet ON wallet.id = wt.wallet_id
        WHERE wt.booking_id = $1
        ORDER BY wt.created_at ASC, wt.id ASC`,
      [bookingId],
    ),
    db.query(
      `SELECT quote.id, quote.provider_id, provider.business_name AS provider_name,
              quote.quoted_price, quote.status, quote.is_accepted, quote.created_at
         FROM booking_quotes quote
         LEFT JOIN providers provider ON provider.id = quote.provider_id
        WHERE quote.booking_id = $1
        ORDER BY quote.created_at ASC`,
      [bookingId],
    ),
  ]);
  return {
    booking: mapQueueItem(booking),
    paymentIntents: paymentIntents.rows,
    walletTransactions: walletTransactions.rows,
    quotes: quotes.rows,
  };
}

export async function submitLegacyFinancialReview(
  bookingId: string,
  input: LegacyFinancialReviewRequest,
  actorId: string,
): Promise<BookingFinancialTerms> {
  return reviewLegacyBookingFinancialTerms(bookingId, input, actorId);
}
