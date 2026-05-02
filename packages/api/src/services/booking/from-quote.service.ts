// Phase 14 Dispatch 05 — quote-based booking pricing resolver (Bug 175).
//
// Validates a customer's quote-acceptance and returns the canonical
// service price from `booking_quotes.quoted_price`. The client may not
// supply a service price for quote-based bookings; the server reads it
// from the accepted quote row.
//
// Schema-divergence note: PART-3 spec assumes a standalone
// `provider_quotes(customer_id, subcategory_id, amount_cents, expires_at,
// status)` table where a quote creates a NEW booking. Reality (migration
// 004) is `booking_quotes(booking_id, provider_id, quoted_price,
// expires_at, is_accepted, status)` bound to an existing booking — the
// customer creates a booking with `bookingType='quote_based'`, providers
// submit quotes against it, customer accepts one. Per Ken's Option A
// (`.ai-coder/decisions/D05-spec-vs-schema.md`), this resolver takes a
// `bookingId` + `quoteId` and validates ownership/expiry/linkage. Bug 175
// intent (server-canonical price for quote path) is preserved and was
// already partially in place via `booking.service.ts:725 acceptQuote`;
// this module exposes the validation+resolution layer in a testable
// shape so future code paths can consume it.
//
// This module is READ-ONLY. The mutation (UPDATE booking_quotes SET
// is_accepted=TRUE, UPDATE bookings SET service_price=..., etc.) lives
// in the caller's transaction (currently `booking.service.ts:752`).
// Migrating that caller to consume `validateAndResolveQuote` is deferred
// to subtask 7 / a follow-up dispatch to keep the change footprint small.

import { db } from '../../models/db';
import { createAppError } from '../../middleware/error.middleware';

export const QUOTE_ERRORS = {
  bookingNotFound: 'booking_not_found',
  bookingNotForUser: 'booking_not_for_user',
  bookingWrongStateForQuote: 'booking_wrong_state_for_quote',
  quoteNotFound: 'quote_not_found',
  quoteWrongBooking: 'quote_wrong_booking',
  quoteExpired: 'quote_expired',
  quoteWrongStatus: 'quote_wrong_status',
} as const;

export interface QuoteAcceptInput {
  bookingId: string;
  quoteId: string;
  customerId: string;
}

export interface ResolvedQuotePricing {
  bookingId: string;
  quoteId: string;
  providerId: string;
  servicePriceCents: number;
}

interface BookingRow {
  id: string;
  customer_id: string;
  status: string;
}

interface QuoteRow {
  id: string;
  booking_id: string;
  provider_id: string;
  quoted_price: number | string;
  expires_at: Date | string;
  is_accepted: boolean;
  status: string | null;
}

const QUOTE_ACCEPTABLE_BOOKING_STATES = new Set(['requested', 'quoted']);
// Phase B CRIT-10 fix — drop 'accepted' from the acceptable set.
// Pre-fix: validateAndResolveQuote accepted re-acceptance of an
// already-accepted quote, which let a customer trigger a second
// price recompute (potentially with a different surge multiplier or
// addon set) on a booking whose price was already locked. Combined
// with the booking row's service_price already being set from the
// first acceptance, this opened a re-charge / double-charge window.
// Post-fix: a quote can only be resolved once. The is_accepted check
// below adds a second layer (defense in depth in case some other
// caller writes 'submitted' status while is_accepted=TRUE).
const QUOTE_ACCEPTABLE_QUOTE_STATUSES = new Set([null, 'submitted']);

export async function validateAndResolveQuote(
  input: QuoteAcceptInput,
): Promise<ResolvedQuotePricing> {
  const bookingRes = await db.query<BookingRow>(
    `SELECT id, customer_id, status FROM bookings WHERE id = $1`,
    [input.bookingId],
  );
  if (bookingRes.rows.length === 0) {
    throw createAppError(QUOTE_ERRORS.bookingNotFound, 404);
  }
  const booking = bookingRes.rows[0]!;
  if (booking.customer_id !== input.customerId) {
    throw createAppError(QUOTE_ERRORS.bookingNotForUser, 403);
  }
  if (!QUOTE_ACCEPTABLE_BOOKING_STATES.has(booking.status)) {
    throw createAppError(QUOTE_ERRORS.bookingWrongStateForQuote, 409);
  }

  const quoteRes = await db.query<QuoteRow>(
    `SELECT id, booking_id, provider_id, quoted_price, expires_at, is_accepted, status
       FROM booking_quotes WHERE id = $1`,
    [input.quoteId],
  );
  if (quoteRes.rows.length === 0) {
    throw createAppError(QUOTE_ERRORS.quoteNotFound, 404);
  }
  const quote = quoteRes.rows[0]!;
  if (quote.booking_id !== input.bookingId) {
    throw createAppError(QUOTE_ERRORS.quoteWrongBooking, 400);
  }

  const expiresMs = new Date(quote.expires_at).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    throw createAppError(QUOTE_ERRORS.quoteExpired, 400);
  }

  if (!QUOTE_ACCEPTABLE_QUOTE_STATUSES.has(quote.status as string | null)) {
    throw createAppError(QUOTE_ERRORS.quoteWrongStatus, 400);
  }
  // Phase B CRIT-10 fix — explicit is_accepted guard. Defense in
  // depth on top of the status set restriction above.
  if (quote.is_accepted === true) {
    throw createAppError(QUOTE_ERRORS.quoteWrongStatus, 400);
  }

  const servicePriceCents = Number(quote.quoted_price);
  if (!Number.isFinite(servicePriceCents) || servicePriceCents <= 0) {
    throw createAppError(QUOTE_ERRORS.quoteNotFound, 400);
  }

  return {
    bookingId: input.bookingId,
    quoteId: input.quoteId,
    providerId: quote.provider_id,
    servicePriceCents,
  };
}
