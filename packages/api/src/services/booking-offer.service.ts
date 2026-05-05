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
import { formatPHP } from '../utils/currency';

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
 * Pick the next provider not yet offered this booking, INSERT an
 * offer row, return it. If all candidates exhausted (or none in the
 * radius), throws 409 noProviderAvailable.
 */
export async function kickOfferCycle(bookingId: string): Promise<OfferRow | null> {
  const bk = await loadBookingForOffer(bookingId);

  if (!bk.latitude || !bk.longitude) {
    throw createAppError('Booking is missing service coordinates.', 400);
  }

  // Status guard — only kick from these stages so we don't restart
  // an offer cycle for a booking already past dispatch.
  const validStartStatuses = new Set(['requested', 'matched']);
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

    await client.query(
      `UPDATE bookings
          SET provider_id=$1, status='matched', updated_at=NOW()
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
