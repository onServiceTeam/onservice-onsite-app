/**
 * Phase 36b — 45s round-robin booking-offer service.
 *
 * Drives the offer lifecycle:
 *   - kickOfferCycle(bookingId): runs the matcher, picks top candidate,
 *     INSERTs a booking_offers row, notifies the provider, returns the
 *     offer record. Caller's responsibility to schedule the cron sweep
 *     (or wait the 45s).
 *   - acceptOffer(offerId, providerUserId): provider POSTs to accept
 *     within the 45s window. Flips status='accepted', updates the
 *     booking row to point at the provider + advances status →
 *     'matched' (the existing customer-pays-flow then takes over).
 *   - declineOffer(offerId, providerUserId, reason): provider declines.
 *     Status='declined'. Caller should immediately call
 *     kickOfferCycle() again to roll to next provider.
 *   - sweepExpiredOffers(): cron entry point. Looks for status='pending'
 *     AND expires_at < NOW(), flips to 'expired', and re-kicks the
 *     cycle for affected bookings.
 *   - cancelOpenOffers(bookingId): admin/customer cancels booking;
 *     mark any pending offers as 'cancelled'.
 *
 * Telemetry: every offer lifecycle event is logged so we can later
 * compute "average attempts to match" + "abandon rate".
 */

import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import * as matchingService from './matching.service';
import * as notificationService from './notification.service';

const OFFER_TIMEOUT_SECONDS = 45;
const MAX_OFFER_ATTEMPTS = 10;

export interface OfferRow {
  id: string;
  booking_id: string;
  provider_id: string;
  score: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  offered_at: Date;
  expires_at: Date;
  responded_at: Date | null;
  decline_reason: string | null;
  attempt_number: number;
}

interface BookingOfferContext {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  customer_id: string;
  scheduled_at: Date;
  latitude: string | null;
  longitude: string | null;
  status: string;
  service_price: number;
  // BUG-PHASE131-01 fix — city now sourced from the booking row,
  // not hardcoded as "Boracay" in the notification call below.
  city: string;
}

async function loadBookingForOffer(bookingId: string): Promise<BookingOfferContext> {
  const r = await db.query<BookingOfferContext>(
    `SELECT id, category_id, subcategory_id, customer_id,
            scheduled_at, latitude, longitude, status, service_price, city
       FROM bookings WHERE id = $1`, [bookingId]);
  if (r.rows.length === 0) throw createAppError('Booking not found.', 404);
  return r.rows[0]!;
}

/**
 * Phase 200 — notify the customer at most once per booking that no provider
 * is currently available. Guarded by a lookup so repeated sweep cycles don't
 * spam them. Best-effort: never throws into the offer cycle.
 */
async function notifyCustomerNoProviderOnce(customerId: string, bookingId: string): Promise<void> {
  try {
    const existing = await db.query(
      `SELECT 1 FROM notifications
        WHERE user_id = $1 AND type = 'no_provider_available'
          AND data->>'bookingId' = $2
        LIMIT 1`,
      [customerId, bookingId],
    );
    if (existing.rows.length > 0) return;
    await notificationService.createPushNotification({
      userId: customerId,
      type: 'no_provider_available',
      title: 'Still finding your provider',
      body: 'No provider is available for your booking right now. Our team is on it and you will be notified the moment someone is matched.',
      data: { bookingId },
    });
    logger.info('Customer notified: no provider available', { bookingId, customerId });
  } catch (err) {
    logger.warn('notifyCustomerNoProviderOnce failed', {
      bookingId, error: (err as Error).message,
    });
  }
}

/**
 * Pick the next provider not yet offered this booking, INSERT an
 * offer row, return it. If all candidates exhausted (or none in the
 * radius), notifies the customer once and returns null.
 */
export async function kickOfferCycle(bookingId: string): Promise<OfferRow | null> {
  const bk = await loadBookingForOffer(bookingId);

  if (!bk.latitude || !bk.longitude) {
    throw createAppError('Booking is missing service coordinates.', 400);
  }

  // Status guard — only kick from these stages so we don't restart
  // an offer cycle for a booking already in service. 'payment_pending' and
  // 'paid' are included for the fixed-price INSTANT-PAY flow, where the customer
  // pays before a provider is matched, so the offer cycle has to be able to run
  // (and the cron sweep to re-run) on an already-paid-but-unmatched booking.
  const validStartStatuses = new Set(['requested', 'matched', 'payment_pending', 'paid']);
  if (!validStartStatuses.has(bk.status)) {
    throw createAppError(
      `Cannot start offer cycle from status "${bk.status}". Allowed: ${[...validStartStatuses].join(', ')}.`,
      409,
    );
  }

  // How many attempts so far?
  const attemptCountRow = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM booking_offers WHERE booking_id = $1`,
    [bookingId]);
  const attemptCount = Number(attemptCountRow.rows[0]?.count ?? 0);
  if (attemptCount >= MAX_OFFER_ATTEMPTS) {
    throw createAppError(
      `Max offer attempts (${MAX_OFFER_ATTEMPTS}) reached without acceptance.`,
      409,
    );
  }

  // Get the ranked candidates from the matching service.
  const candidates = await matchingService.findMatchingProviders(
    bk.category_id,
    bk.subcategory_id,
    Number(bk.latitude),
    Number(bk.longitude),
    bk.scheduled_at,
  );

  // Filter out anyone we've already offered (any status).
  const previouslyOffered = await db.query<{ provider_id: string }>(
    `SELECT provider_id FROM booking_offers WHERE booking_id = $1`, [bookingId]);
  const tried = new Set(previouslyOffered.rows.map(r => r.provider_id));

  const next = candidates.find(c => !tried.has(c.providerId));
  if (!next) {
    logger.info('Offer cycle exhausted — no untried candidates remain', {
      bookingId, candidateCount: candidates.length, triedCount: tried.size,
    });
    // Phase 200 — tell the customer once, so a booking with no available
    // provider does not just sit silently on "Looking for provider".
    await notifyCustomerNoProviderOnce(bk.customer_id, bookingId);
    return null;
  }

  // INSERT the offer row.
  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000);
  const result = await db.query<OfferRow>(
    `INSERT INTO booking_offers
       (booking_id, provider_id, score, expires_at, attempt_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [bookingId, next.providerId, next.score, expiresAt, attemptCount + 1],
  );
  const offer = result.rows[0]!;

  // Notify the provider. Best-effort; we don't fail the offer if push
  // is suppressed or fails.
  try {
    // BUG-PHASE131-01 fix — pre-fix this hardcoded 'Boracay' regardless
    // of the actual booking city. For v1.0 (Boracay-only launch) this
    // happened to be correct most of the time, but admin-created test
    // bookings or future v1.1 markets would have shown providers a
    // wrong city in the push notification ("New job in Boracay" when
    // the job is actually in Caticlan). Now sourced from the booking
    // row directly — same field that drives the matching service area.
    await notificationService.notifyProviderNewJob(
      next.userId,
      bookingId,
      'New job available',
      bk.service_price,
      bk.city,
      // Phase 200 fix — pass the offer id so the provider's app can actually
      // accept/decline THIS offer (POST /bookings/offers/:offerId/accept).
      offer.id,
    );
  } catch (err) {
    logger.warn('notifyProviderNewJob failed in kickOfferCycle', {
      bookingId, providerId: next.providerId, error: (err as Error).message,
    });
  }

  logger.info('Offer kicked', {
    bookingId, providerId: next.providerId,
    attemptNumber: offer.attempt_number, expiresAt: expiresAt.toISOString(),
  });

  return offer;
}

/**
 * Fixed-price INSTANT-PAY safety net: once a booking is paid, make sure it is
 * actually being offered to a provider. Auto-dispatch normally kicks the offer
 * cycle at booking creation (when auto_dispatch_enabled is on), but instant-pay
 * has no "find me a provider" step, so a paid booking could otherwise sit
 * unmatched if that toggle is off or the create-time dispatch found no one yet.
 * Best-effort and idempotent: skips if a provider is already assigned, if an
 * offer is already pending, or if the booking lacks coordinates. Never throws
 * into the payment / webhook path.
 */
export async function dispatchPaidBookingIfNeeded(bookingId: string): Promise<void> {
  try {
    const row = (await db.query<{ provider_id: string | null; latitude: string | null; longitude: string | null }>(
      `SELECT provider_id, latitude, longitude FROM bookings WHERE id = $1`,
      [bookingId],
    )).rows[0];
    if (!row) return;
    if (row.provider_id) return;                 // already matched to a provider
    if (!row.latitude || !row.longitude) return; // can't offer without a location
    const pending = await db.query(
      `SELECT 1 FROM booking_offers WHERE booking_id = $1 AND status = 'pending' LIMIT 1`,
      [bookingId],
    );
    if (pending.rows.length > 0) return;         // an offer is already out
    await kickOfferCycle(bookingId);
  } catch (err) {
    logger.warn('dispatchPaidBookingIfNeeded failed (non-fatal)', {
      bookingId, error: (err as Error).message,
    });
  }
}

/**
 * Provider accepts an offer. Atomically:
 *   1. Mark offer accepted
 *   2. Set bookings.provider_id + bookings.status='matched'
 *   3. Cancel any other pending offers for the same booking (idempotent
 *      cleanup if cron+accept race)
 */
export async function acceptOffer(
  offerId: string,
  providerUserId: string,
): Promise<{ booking_id: string; provider_id: string }> {
  return db.transaction(async (client) => {
    // Lock the offer row so concurrent accept/decline calls serialise.
    const offerRow = await client.query<OfferRow & { provider_user_id: string }>(
      `SELECT bo.*, p.user_id AS provider_user_id
         FROM booking_offers bo
         JOIN providers p ON p.id = bo.provider_id
        WHERE bo.id = $1
        FOR UPDATE OF bo`,
      [offerId]);
    if (offerRow.rows.length === 0) throw createAppError('Offer not found.', 404);
    const offer = offerRow.rows[0]!;

    if (offer.provider_user_id !== providerUserId) {
      throw createAppError('You are not the recipient of this offer.', 403);
    }
    if (offer.status !== 'pending') {
      throw createAppError(`Offer cannot be accepted (current: ${offer.status}).`, 409);
    }
    if (new Date(offer.expires_at) < new Date()) {
      // Race: the offer expired between SELECT and us.
      // Mark expired and reject.
      await client.query(
        `UPDATE booking_offers SET status='expired', responded_at=NOW() WHERE id=$1`,
        [offerId]);
      throw createAppError('Offer has expired.', 409);
    }

    // Flip offer + booking + cancel siblings.
    await client.query(
      `UPDATE booking_offers
          SET status='accepted', responded_at=NOW()
        WHERE id=$1`,
      [offerId]);

    await client.query(
      `UPDATE booking_offers
          SET status='cancelled', responded_at=NOW()
        WHERE booking_id=$1 AND id<>$2 AND status='pending'`,
      [offer.booking_id, offerId]);

    // Assign the provider. Advance to 'matched' ONLY if the booking hasn't been
    // paid yet (quote-based / match-first flow). Under fixed-price INSTANT-PAY
    // the customer may already have paid by the time a provider accepts, so the
    // booking is 'payment_pending'/'paid'/beyond — in that case we must keep the
    // existing status and just record the provider, never reset it to 'matched'
    // (that would corrupt the money state and re-demand payment). E03, 2026-06-16.
    await client.query(
      `UPDATE bookings
          SET provider_id=$1,
              status = CASE WHEN status IN ('requested','quoted') THEN 'matched' ELSE status END,
              updated_at=NOW()
        WHERE id=$2`,
      [offer.provider_id, offer.booking_id]);

    logger.info('Offer accepted', {
      offerId, bookingId: offer.booking_id, providerId: offer.provider_id,
    });

    return { booking_id: offer.booking_id, provider_id: offer.provider_id };
  });
}

/**
 * Provider declines. We log the reason. Caller should immediately
 * kickOfferCycle to roll to next provider.
 */
export async function declineOffer(
  offerId: string,
  providerUserId: string,
  reason: string,
): Promise<{ booking_id: string }> {
  return db.transaction(async (client) => {
    const offerRow = await client.query<OfferRow & { provider_user_id: string }>(
      `SELECT bo.*, p.user_id AS provider_user_id
         FROM booking_offers bo
         JOIN providers p ON p.id = bo.provider_id
        WHERE bo.id = $1 FOR UPDATE OF bo`,
      [offerId]);
    if (offerRow.rows.length === 0) throw createAppError('Offer not found.', 404);
    const offer = offerRow.rows[0]!;
    if (offer.provider_user_id !== providerUserId) {
      throw createAppError('You are not the recipient of this offer.', 403);
    }
    if (offer.status !== 'pending') {
      throw createAppError(`Offer cannot be declined (current: ${offer.status}).`, 409);
    }

    await client.query(
      `UPDATE booking_offers
          SET status='declined', responded_at=NOW(), decline_reason=$2
        WHERE id=$1`,
      [offerId, reason.slice(0, 500)]);

    logger.info('Offer declined', { offerId, bookingId: offer.booking_id });
    return { booking_id: offer.booking_id };
  });
}

/**
 * Cron entry. Look for expired pending offers, mark expired, return
 * the affected booking IDs so the cron can re-kick them.
 */
export async function sweepExpiredOffers(): Promise<{ expiredCount: number; reKickedCount: number }> {
  // Mark stale pending offers as expired in a single statement, return
  // the booking IDs for re-kick.
  const result = await db.query<{ booking_id: string }>(
    `UPDATE booking_offers
        SET status='expired', responded_at=NOW()
      WHERE status='pending' AND expires_at < NOW()
      RETURNING booking_id`);
  const expiredCount = result.rowCount ?? 0;

  let reKickedCount = 0;
  for (const row of result.rows) {
    try {
      const next = await kickOfferCycle(row.booking_id);
      if (next) reKickedCount++;
    } catch (err) {
      // Booking may have moved past the offer-eligible state, or
      // exhausted candidates — log and continue.
      logger.info('sweepExpiredOffers re-kick skipped', {
        bookingId: row.booking_id, reason: (err as Error).message,
      });
    }
  }

  if (expiredCount > 0) {
    logger.info('sweepExpiredOffers complete', { expiredCount, reKickedCount });
  }

  return { expiredCount, reKickedCount };
}

/**
 * Cancel any pending offers for a booking (admin/customer cancels
 * the booking entirely). Idempotent.
 */
export async function cancelOpenOffers(bookingId: string): Promise<number> {
  const result = await db.query(
    `UPDATE booking_offers
        SET status='cancelled', responded_at=NOW()
      WHERE booking_id=$1 AND status='pending'`,
    [bookingId]);
  return result.rowCount ?? 0;
}

/**
 * Phase 200 — auto-dispatch precondition. A booking is eligible for
 * automatic offer-cascade on creation only when it is a fixed-price booking
 * that already carries service coordinates (kickOfferCycle requires lat/lng
 * and a 'requested'/'matched' status). Quote-based job-requests use the
 * quote flow instead. The admin's auto_dispatch_enabled setting is checked
 * separately by the caller; this is the pure shape check.
 */
export function shouldAutoDispatch(booking: {
  booking_type: string;
  latitude: string | null;
  longitude: string | null;
}): boolean {
  return (
    booking.booking_type === 'fixed_price'
    && booking.latitude != null
    && booking.longitude != null
  );
}

export function formatOffer(row: OfferRow): Record<string, unknown> {
  return {
    id: row.id,
    bookingId: row.booking_id,
    providerId: row.provider_id,
    score: row.score === null ? null : Number(row.score),
    status: row.status,
    offeredAt: row.offered_at?.toISOString?.() ?? row.offered_at,
    expiresAt: row.expires_at?.toISOString?.() ?? row.expires_at,
    respondedAt: row.responded_at?.toISOString?.() ?? null,
    declineReason: row.decline_reason,
    attemptNumber: row.attempt_number,
  };
}
