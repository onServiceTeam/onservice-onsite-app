/**
 * Phase 07 — Booking 360 admin service.
 * Read + write actions for the admin Booking Detail page (overview, timeline,
 * evidence, dispute, and sacred money/state mutations).
 *
 * Sacred-file note: this service touches escrow money via delegation to
 * `escrow.service.ts` (`releaseEscrow`, `refundFromEscrow`, `handleCancellation`).
 * No money math is performed here — every centavo flows through the audited
 * escrow primitives in a single transaction. Every mutating function writes a
 * paired `admin_actions` row for traceability. Money mutations are restricted
 * to super-admin at the route layer; this service additionally enforces
 * reason-length and status-precondition checks before delegating.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as escrowService from './escrow.service';
import * as notificationService from './notification.service';
import * as orService from './or.service';
import * as paymentService from './payment.service';
import * as gatewayRetryService from './gateway-retry.service';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface BookingDetail {
  id: string;
  status: string;
  escrowStatus: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  pricingMode: string | null;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  category: { id: string; name: string } | null;
  subcategory: { id: string; name: string } | null;
  address: { full: string; barangay: string; city: string; province: string } | null;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    avatarUrl: string | null;
    lifetimeBookings: number;
    averageRatingGiven: number | null;
  } | null;
  provider: {
    id: string;
    userId: string;
    businessName: string;
    tier: string;
    fullName: string;
    phone: string;
    avatarUrl: string | null;
    rating: number | null;
    lifetimeJobs: number;
  } | null;
  createdAt: string;
}

export interface TimelineEvent {
  at: string;
  type: string;
  description: string;
  actor: { kind: 'system' | 'user' | 'admin'; id: string | null; name: string | null };
  meta?: Record<string, unknown>;
}

export interface BookingEvidence {
  photos: Array<{
    id: string;
    url: string;
    uploadedBy: 'customer' | 'provider' | 'admin';
    uploadedAt: string;
    caption: string | null;
  }>;
  chatMessageCount: number;
  gpsCheckIns: Array<{ at: string; lat: number; lng: number; eventType: string }>;
  receipts: Array<{ id: string; url: string; createdAt: string }>;
}

export interface BookingDispute {
  id: string;
  status: string;
  tier: number;
  type: string;
  description: string;
  filedAt: string;
  filedBy: string;
  providerResponse: string | null;
  providerRespondedAt: string | null;
  resolutionType: string | null;
  refundAmount: number | null;
  resolvedAt: string | null;
}

export interface ManualReleaseResult {
  bookingId: string;
  releasedAmount: number;
  reason: string;
  adminActionId: string;
}

export interface RefundResult {
  bookingId: string;
  refundedAmount: number;
  reason: string;
  adminActionId: string;
}

export interface ReassignResult {
  bookingId: string;
  oldProviderId: string | null;
  newProviderId: string;
  adminActionId: string;
}

export interface CancelResult {
  bookingId: string;
  refundAmount: number;
  adminActionId: string;
  // BUG-PHASE26-01: surfaced so callers can verify the customer-portion
  // refund amount that was sent to PayMongo post-commit.
  customerRefundAmount?: number;
}

export interface ForceCompleteResult {
  bookingId: string;
  adminActionId: string;
}

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

const TERMINAL_REASSIGN_BLOCKED = new Set<string>([
  'completed_by_provider',
  'confirmed',
  'cancelled_by_customer',
  'cancelled_by_provider',
  'cancelled_by_admin',
  'paid_out',
  'payout_ready',
]);

const TERMINAL_CANCELLED = new Set<string>([
  'cancelled_by_customer',
  'cancelled_by_provider',
  'cancelled_by_admin',
]);

const FORCE_COMPLETE_ALLOWED = new Set<string>([
  'in_progress',
  'completed_by_provider',
]);

// BUG-PHASE168-01 fix — pre-fix requireReason had a min check but
// no max. The helper feeds reason into admin_actions.full_notes
// (TEXT, unbounded) across multiple booking-admin actions
// (manualReleaseEscrow, refundFromEscrow, reassignBookingProvider,
// cancelBookingAsAdmin, forceCompleteBooking). Same defense-in-depth
// pattern as Phase 152-167. Cap at 5000 (covers force-complete's
// 20-char min plus enough room for detailed rationale; smaller
// would clip legitimate dispute-defense narratives).
const REASON_MAX_LENGTH = 5000;

function requireReason(reason: string, minLength: number): string {
  const trimmed = (reason ?? '').trim();
  if (!trimmed) throw createAppError('reason is required.', 400);
  if (trimmed.length < minLength) {
    throw createAppError(`reason must be at least ${minLength} characters.`, 400);
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    throw createAppError(`reason must be ≤ ${REASON_MAX_LENGTH} characters.`, 400);
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────
// 1) Booking detail (overview tab)
// ─────────────────────────────────────────────────────────────────

export async function getBookingDetail(bookingId: string): Promise<BookingDetail> {
  const result = await db.query<{
    id: string;
    status: string;
    escrow_status: string | null;
    booking_type: string | null;
    scheduled_at: Date | null;
    completed_at: Date | null;
    confirmed_at: Date | null;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
    service_price: string;
    service_fee: string;
    total_amount: string;
    address: string | null;
    barangay: string | null;
    city: string | null;
    province: string | null;
    created_at: Date;
    category_id: string | null;
    category_name: string | null;
    subcategory_id: string | null;
    subcategory_name: string | null;
    customer_id: string | null;
    customer_first_name: string | null;
    customer_last_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    customer_avatar: string | null;
    provider_id: string | null;
    provider_user_id: string | null;
    provider_business_name: string | null;
    provider_tier: string | null;
    provider_rating: string | null;
    provider_total_jobs: number | null;
    provider_first_name: string | null;
    provider_last_name: string | null;
    provider_phone: string | null;
    provider_avatar: string | null;
  }>(
    `SELECT b.id, b.status, b.escrow_status, b.booking_type,
            b.scheduled_at, b.completed_at, b.confirmed_at, b.cancelled_at,
            b.cancellation_reason,
            b.service_price::text AS service_price,
            b.service_fee::text   AS service_fee,
            b.total_amount::text  AS total_amount,
            b.address, b.barangay, b.city, b.province, b.created_at,
            b.category_id,    sc.name  AS category_name,
            b.subcategory_id, ssc.name AS subcategory_name,
            cu.id           AS customer_id,
            cu.first_name   AS customer_first_name,
            cu.last_name    AS customer_last_name,
            cu.phone        AS customer_phone,
            cu.email        AS customer_email,
            cu.avatar_url   AS customer_avatar,
            p.id            AS provider_id,
            p.user_id       AS provider_user_id,
            p.business_name AS provider_business_name,
            p.tier          AS provider_tier,
            p.rating::text  AS provider_rating,
            p.total_jobs    AS provider_total_jobs,
            pu.first_name   AS provider_first_name,
            pu.last_name    AS provider_last_name,
            pu.phone        AS provider_phone,
            pu.avatar_url   AS provider_avatar
       FROM bookings b
       LEFT JOIN service_categories sc     ON sc.id  = b.category_id
       LEFT JOIN service_subcategories ssc ON ssc.id = b.subcategory_id
       LEFT JOIN users cu                  ON cu.id  = b.customer_id
       LEFT JOIN providers p               ON p.id   = b.provider_id
       LEFT JOIN users pu                  ON pu.id  = p.user_id
      WHERE b.id = $1`,
    [bookingId],
  );

  const row = result.rows[0];
  if (!row) throw createAppError('Booking not found.', 404);

  let lifetimeBookings = 0;
  let averageRatingGiven: number | null = null;
  if (row.customer_id) {
    const cstats = await db.query<{ lifetime: string; avg: string | null }>(
      `SELECT COUNT(*)::text AS lifetime,
              (SELECT AVG(rating)::text FROM reviews WHERE reviewer_id = $1) AS avg
         FROM bookings WHERE customer_id = $1`,
      [row.customer_id],
    );
    lifetimeBookings = Number(cstats.rows[0]?.lifetime ?? 0);
    averageRatingGiven = cstats.rows[0]?.avg ? Number(cstats.rows[0].avg) : null;
  }

  const address = row.address && row.barangay && row.city && row.province
    ? {
        full: row.address,
        barangay: row.barangay,
        city: row.city,
        province: row.province,
      }
    : null;

  const customer = row.customer_id
    ? {
        id: row.customer_id,
        fullName: `${row.customer_first_name ?? ''} ${row.customer_last_name ?? ''}`.trim(),
        phone: row.customer_phone ?? '',
        email: row.customer_email,
        avatarUrl: row.customer_avatar,
        lifetimeBookings,
        averageRatingGiven,
      }
    : null;

  const provider = row.provider_id && row.provider_user_id
    ? {
        id: row.provider_id,
        userId: row.provider_user_id,
        businessName: row.provider_business_name ?? '',
        tier: row.provider_tier ?? 'new',
        fullName: `${row.provider_first_name ?? ''} ${row.provider_last_name ?? ''}`.trim(),
        phone: row.provider_phone ?? '',
        avatarUrl: row.provider_avatar,
        rating: row.provider_rating !== null ? Number(row.provider_rating) : null,
        lifetimeJobs: Number(row.provider_total_jobs ?? 0),
      }
    : null;

  return {
    id: row.id,
    status: row.status,
    escrowStatus: row.escrow_status,
    scheduledAt: row.scheduled_at ? row.scheduled_at.toISOString() : null,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    cancellationReason: row.cancellation_reason,
    pricingMode: row.booking_type,
    servicePrice: Number(row.service_price),
    serviceFee: Number(row.service_fee),
    totalAmount: Number(row.total_amount),
    category: row.category_id ? { id: row.category_id, name: row.category_name ?? '' } : null,
    subcategory: row.subcategory_id
      ? { id: row.subcategory_id, name: row.subcategory_name ?? '' }
      : null,
    address,
    customer,
    provider,
    createdAt: row.created_at.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────
// 2) Timeline
// ─────────────────────────────────────────────────────────────────

export async function getBookingTimeline(bookingId: string): Promise<TimelineEvent[]> {
  const bookingResult = await db.query<{
    id: string;
    created_at: Date;
    confirmed_at: Date | null;
    completed_at: Date | null;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
    customer_id: string | null;
  }>(
    `SELECT id, created_at, confirmed_at, completed_at, cancelled_at,
            cancellation_reason, customer_id
       FROM bookings
      WHERE id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  const events: TimelineEvent[] = [];

  events.push({
    at: booking.created_at.toISOString(),
    type: 'booking_created',
    description: 'Booking was created.',
    actor: { kind: 'user', id: booking.customer_id, name: null },
  });

  if (booking.confirmed_at) {
    events.push({
      at: booking.confirmed_at.toISOString(),
      type: 'booking_confirmed',
      description: 'Customer confirmed the completed job.',
      actor: { kind: 'user', id: booking.customer_id, name: null },
    });
  }

  if (booking.completed_at) {
    events.push({
      at: booking.completed_at.toISOString(),
      type: 'job_completed',
      description: 'Provider marked the job as completed.',
      actor: { kind: 'system', id: null, name: null },
    });
  }

  if (booking.cancelled_at) {
    events.push({
      at: booking.cancelled_at.toISOString(),
      type: 'booking_cancelled',
      description: booking.cancellation_reason ?? 'Booking was cancelled.',
      actor: { kind: 'system', id: null, name: null },
    });
  }

  const adminActionsResult = await db.query<{
    id: string;
    admin_id: string;
    action_type: string;
    reason: string | null;
    details: unknown;
    created_at: Date;
    admin_first: string | null;
    admin_last: string | null;
  }>(
    `SELECT a.id, a.admin_id, a.action_type, a.reason, a.details, a.created_at,
            u.first_name AS admin_first, u.last_name AS admin_last
       FROM admin_actions a
       LEFT JOIN users u ON u.id = a.admin_id
      WHERE a.target_type = 'booking' AND a.target_id = $1
      ORDER BY a.created_at ASC`,
    [bookingId],
  );

  for (const r of adminActionsResult.rows) {
    const adminName = `${r.admin_first ?? ''} ${r.admin_last ?? ''}`.trim() || null;
    events.push({
      at: r.created_at.toISOString(),
      type: r.action_type,
      description: r.reason ?? `Admin action: ${r.action_type}`,
      actor: { kind: 'admin', id: r.admin_id, name: adminName },
      meta:
        r.details && typeof r.details === 'object'
          ? (r.details as Record<string, unknown>)
          : undefined,
    });
  }

  // Best-effort chat first/last
  try {
    const chatResult = await db.query<{ first_at: Date | null; last_at: Date | null; cnt: string }>(
      `SELECT MIN(m.created_at) AS first_at,
              MAX(m.created_at) AS last_at,
              COUNT(*)::text    AS cnt
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.booking_id = $1`,
      [bookingId],
    );
    const chat = chatResult.rows[0];
    if (chat && Number(chat.cnt) > 0 && chat.first_at && chat.last_at) {
      events.push({
        at: chat.first_at.toISOString(),
        type: 'chat_started',
        description: 'First chat message between customer and provider.',
        actor: { kind: 'system', id: null, name: null },
        meta: { messageCount: Number(chat.cnt) },
      });
      if (chat.last_at.getTime() !== chat.first_at.getTime()) {
        events.push({
          at: chat.last_at.toISOString(),
          type: 'chat_last_message',
          description: 'Most recent chat message.',
          actor: { kind: 'system', id: null, name: null },
        });
      }
    }
  } catch (err) {
    logger.info('Chat timeline lookup skipped', { bookingId, err: String(err) });
  }

  return events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// ─────────────────────────────────────────────────────────────────
// 3) Evidence
// ─────────────────────────────────────────────────────────────────

export async function getBookingEvidence(bookingId: string): Promise<BookingEvidence> {
  const bookingResult = await db.query<{
    id: string;
    customer_id: string;
    provider_user_id: string | null;
  }>(
    `SELECT b.id, b.customer_id, p.user_id AS provider_user_id
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  // MED-N09 fix: read from BOTH the legacy `booking_images` table
  // (pre-D07) AND the new canonical `booking_photos` table
  // (migration 079, written to by the upload service since D07).
  // Pre-fix: only legacy table was queried, so any photo uploaded
  // through the post-D07 mobile flow was invisible to admin
  // evidence review. UNION ALL with normalized columns; the
  // resulting list is sorted by created_at across both sources.
  const photosResult = await db.query<{
    id: string;
    photo_url: string;
    photo_type: string | null;
    uploaded_by: string;
    uploaded_by_role: string | null;
    created_at: Date;
  }>(
    // BUG-PHASE18-05 fix: booking_photos has `uploaded_at`, NOT `created_at`.
    // The pre-fix UNION threw "column 'created_at' does not exist" on every
    // call, so the evidence tab on /bookings/:id always returned 500. Alias
    // booking_photos.uploaded_at AS created_at so the union shape matches and
    // the existing downstream `r.created_at.toISOString()` still works.
    `SELECT id, image_url AS photo_url, image_type AS photo_type, uploaded_by,
            NULL::text AS uploaded_by_role, created_at
       FROM booking_images
      WHERE booking_id = $1
    UNION ALL
     SELECT id, COALESCE(storage_url, storage_key) AS photo_url, photo_type,
            uploaded_by, uploaded_by_role, uploaded_at AS created_at
       FROM booking_photos
      WHERE booking_id = $1 AND deleted_at IS NULL
    ORDER BY created_at ASC`,
    [bookingId],
  );

  const photos = photosResult.rows.map((r) => {
    const uploadedBy: 'customer' | 'provider' | 'admin' =
      r.uploaded_by_role === 'admin'
        ? 'admin'
        : r.uploaded_by_role === 'customer' || r.uploaded_by === booking.customer_id
          ? 'customer'
          : 'provider';
    return {
      id: r.id,
      url: r.photo_url,
      uploadedBy,
      uploadedAt: r.created_at.toISOString(),
      caption: r.photo_type ?? null,
    };
  });

  const chatResult = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.booking_id = $1`,
    [bookingId],
  );
  const chatMessageCount = Number(chatResult.rows[0]?.cnt ?? 0);

  // MED-N08 fix: pre-fix had two `to_regclass` defensive checks for
  // `gps_checkins` and `receipts` tables that don't exist in any
  // migration (and are not planned for v1.0). The dead code added
  // two round-trips per evidence query for nothing. Removed; the
  // BookingEvidence type still has the empty arrays for forward
  // compatibility (admin UI renders an "empty" state).
  const gpsCheckIns: BookingEvidence['gpsCheckIns'] = [];
  const receipts: BookingEvidence['receipts'] = [];

  return { photos, chatMessageCount, gpsCheckIns, receipts };
}

// ─────────────────────────────────────────────────────────────────
// 4) Dispute attached to booking
// ─────────────────────────────────────────────────────────────────

export async function getBookingDispute(bookingId: string): Promise<BookingDispute | null> {
  const result = await db.query<{
    id: string;
    status: string;
    tier: number;
    type: string;
    description: string;
    created_at: Date;
    filed_by: string;
    provider_response: string | null;
    provider_responded_at: Date | null;
    resolution_type: string | null;
    refund_amount: string | null;
    resolved_at: Date | null;
  }>(
    `SELECT id, status, tier, type, description, created_at, filed_by,
            provider_response, provider_responded_at,
            resolution_type, refund_amount::text AS refund_amount, resolved_at
       FROM disputes
      WHERE booking_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [bookingId],
  );

  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    tier: r.tier,
    type: r.type,
    description: r.description,
    filedAt: r.created_at.toISOString(),
    filedBy: r.filed_by,
    providerResponse: r.provider_response,
    providerRespondedAt: r.provider_responded_at
      ? r.provider_responded_at.toISOString()
      : null,
    resolutionType: r.resolution_type,
    refundAmount: r.refund_amount !== null ? Number(r.refund_amount) : null,
    resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
  };
}

// ─────────────────────────────────────────────────────────────────
// 5) Manual escrow release (SACRED — super-admin only at route layer)
// ─────────────────────────────────────────────────────────────────

export async function manualReleaseEscrow(
  bookingId: string,
  reason: string,
  adminUserId: string,
): Promise<ManualReleaseResult> {
  const trimmedReason = requireReason(reason, 10);

  // Phase 14 Dispatch 06 — Bug 70. Pre-D06 the escrow money work ran in
  // escrowService.releaseEscrow's internal transaction; the admin_actions
  // audit then ran in a SEPARATE top-level db.query. If the audit insert
  // failed (CHECK constraint violation, FK error), the money had already
  // moved without an audit trail. Now: ONE outer transaction wraps the
  // trx-aware escrow helper + the admin_actions INSERT. OR issuance is
  // post-commit per the Phase 08 documented pattern.
  const result = await db.transaction(async (client) => {
    const breakdown = await escrowService.releaseEscrowInTransaction(client, bookingId);
    const releasedAmount =
      Number(breakdown.providerReceives ?? 0) + Number(breakdown.platformRetains ?? 0);

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'manual_escrow_release', 'booking', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({ bookingId, reason: trimmedReason, releasedAmount }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record manual escrow release admin action.', 500);
    }

    return { bookingId, releasedAmount, reason: trimmedReason, adminActionId, breakdown };
  });

  logger.info('Manual escrow release executed', {
    bookingId,
    adminUserId,
    adminActionId: result.adminActionId,
    releasedAmount: result.releasedAmount,
  });

  // gate-c-allowed: post-commit-or-issuance
  // Phase 08 documented pattern: BIR OR issuance can fail without
  // invalidating the money movement. Errors are logged for follow-up; a
  // separate BullMQ job retries OR issuance based on recently-released
  // escrow rows.
  try {
    await orService.issueOR({
      bookingId,
      commissionAmount: result.breakdown.commissionAmount,
      serviceFeeAmount: result.breakdown.serviceFeeAmount,
      providerReceived: result.breakdown.providerReceives,
      platformRetained: result.breakdown.platformRetains,
    });
  } catch (orErr) {
    logger.error('OR issuance failed after manual escrow release (audit-only side effect)', {
      bookingId,
      error: orErr instanceof Error ? orErr.message : String(orErr),
    });
  }

  return {
    bookingId: result.bookingId,
    releasedAmount: result.releasedAmount,
    reason: result.reason,
    adminActionId: result.adminActionId,
  };
}

// ─────────────────────────────────────────────────────────────────
// 6) Refund booking escrow (SACRED — super-admin only at route layer)
// ─────────────────────────────────────────────────────────────────

export async function refundBookingEscrow(
  bookingId: string,
  refundAmount: number,
  reason: string,
  adminUserId: string,
): Promise<RefundResult> {
  if (
    !Number.isFinite(refundAmount) ||
    !Number.isInteger(refundAmount) ||
    refundAmount <= 0
  ) {
    throw createAppError('refundAmount must be a positive integer (centavos).', 400);
  }
  const trimmedReason = requireReason(reason, 10);

  // Phase 14 Dispatch 06 — Bug 71. Pre-D06 the escrow refund ran in
  // escrowService.refundFromEscrow's internal transaction, then the
  // admin_actions audit ran in a SEPARATE top-level db.query. If the
  // audit insert failed, the customer wallet had been credited (via
  // escrow pending_balance debit) without an audit trail. Now: ONE
  // outer transaction wraps the trx-aware refund helper + the
  // admin_actions INSERT. Gateway refund (paymentService.processRefund)
  // stays post-commit per the documented pattern (gateway calls are
  // idempotent and tolerate retry).
  const result = await db.transaction(async (client) => {
    await escrowService.refundFromEscrowInTransaction(
      client,
      bookingId,
      refundAmount,
      trimmedReason,
    );

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'refund_issued', 'booking', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({ bookingId, refundAmount }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record refund admin action.', 500);
    }

    return { adminActionId };
  });

  logger.info('Booking escrow refund executed', {
    bookingId,
    adminUserId,
    adminActionId: result.adminActionId,
    refundAmount,
  });

  // gate-c-allowed: post-commit-gateway-refund
  // The gateway processRefund call mirrors the pre-D06 escrowService.refundFromEscrow
  // ordering. Failure here is logged but does not roll back the money/audit
  // pair, which are already durable — the gateway dispute resolution lives
  // outside our transaction boundary.
  try {
    await paymentService.processRefund(bookingId, refundAmount, trimmedReason);
  } catch (err) {
    logger.error('Gateway refund call failed after escrow + audit committed (logged, not rolled back)', {
      bookingId,
      refundAmount,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    bookingId,
    refundedAmount: refundAmount,
    reason: trimmedReason,
    adminActionId: result.adminActionId,
  };
}

// ─────────────────────────────────────────────────────────────────
// 7) Reassign provider (super-admin only at route layer)
// ─────────────────────────────────────────────────────────────────

export async function reassignBookingProvider(
  bookingId: string,
  newProviderId: string,
  reason: string,
  adminUserId: string,
): Promise<ReassignResult> {
  const trimmedReason = requireReason(reason, 5);

  return db.transaction(async (client) => {
    const bookingResult = await client.query<{ id: string; status: string; provider_id: string | null }>(
      `SELECT id, status, provider_id FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );
    const booking = bookingResult.rows[0];
    if (!booking) throw createAppError('Booking not found.', 404);

    if (TERMINAL_REASSIGN_BLOCKED.has(booking.status)) {
      throw createAppError(
        `Cannot reassign booking in status "${booking.status}".`,
        409,
      );
    }

    const providerResult = await client.query<{ id: string; is_active: boolean }>(
      `SELECT p.id, u.is_active
         FROM providers p
         JOIN users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [newProviderId],
    );
    const provider = providerResult.rows[0];
    if (!provider) throw createAppError('New provider not found.', 404);
    if (!provider.is_active) {
      throw createAppError('New provider is not active.', 409);
    }

    await client.query(
      `UPDATE bookings SET provider_id = $1, updated_at = NOW() WHERE id = $2`,
      [newProviderId, bookingId],
    );

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'booking_reassigned', 'booking', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({ oldProviderId: booking.provider_id, newProviderId }),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record reassign admin action.', 500);
    }

    logger.info('Booking provider reassigned', {
      bookingId,
      oldProviderId: booking.provider_id,
      newProviderId,
      adminUserId,
      adminActionId,
    });

    return {
      bookingId,
      oldProviderId: booking.provider_id,
      newProviderId,
      adminActionId,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 8) Cancel booking as admin
// ─────────────────────────────────────────────────────────────────

export async function cancelBookingAsAdmin(
  bookingId: string,
  reason: string,
  adminUserId: string,
  hoursUntilScheduled?: number,
  providerArrived?: boolean,
  customerNoShow?: boolean,
): Promise<CancelResult> {
  const trimmedReason = requireReason(reason, 10);

  // Pre-flight read (read-only, fast-fail outside any transaction).
  const bookingResult = await db.query<{
    id: string;
    status: string;
    escrow_status: string | null;
  }>(
    `SELECT id, status, escrow_status FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);
  if (TERMINAL_CANCELLED.has(booking.status)) {
    throw createAppError(
      `Booking is already cancelled (status: ${booking.status}).`,
      409,
    );
  }

  const hoursValue = hoursUntilScheduled ?? 0;
  const arrivedValue = providerArrived ?? false;
  const noShowValue = customerNoShow ?? false;

  // Phase 14 Dispatch 06 — Bug 69. Pre-D06 the escrow refund ran in a
  // separate transaction from the booking status update + admin_actions
  // audit. If the audit insert failed after escrow money had moved, the
  // money/audit pair was inconsistent. Now: ONE transaction wraps the
  // escrow handling (via trx-aware helper), booking status update, and
  // admin_actions insert. If the audit insert throws, the escrow money
  // movement and the booking status flip both roll back.
  // BUG-PHASE26-01 fix: capture serviceFee BEFORE the trx so we can
  // post-commit issue the PayMongo refund with the same total amount
  // that refundFromEscrowInTransaction debited.
  const feeRow = await db.query<{ service_fee: string | number }>(
    `SELECT service_fee FROM bookings WHERE id = $1`, [bookingId]);
  const serviceFee = feeRow.rows[0] ? Number(feeRow.rows[0].service_fee) : 0;

  const trxResult = await db.transaction(async (client) => {
    let refundAmount = 0;
    let customerRefundAmount = 0;
    if (booking.escrow_status === 'held') {
      const refund = await escrowService.handleCancellationInTransaction(
        client,
        bookingId,
        hoursValue,
        arrivedValue,
        noShowValue,
      );
      refundAmount = Number(refund.customerRefundAmount ?? 0);
      customerRefundAmount = Number(refund.customerRefundAmount ?? 0);
    }

    await client.query(
      `UPDATE bookings
          SET status = 'cancelled_by_admin',
              cancelled_at = NOW(),
              cancellation_reason = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [bookingId, trimmedReason],
    );

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'booking_cancelled', 'booking', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({
          hoursUntilScheduled: hoursValue,
          providerArrived: arrivedValue,
          customerNoShow: noShowValue,
          refundAmount,
        }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record cancellation admin action.', 500);
    }

    logger.info('Booking cancelled by admin', {
      bookingId,
      adminUserId,
      adminActionId,
      refundAmount,
      hoursUntilScheduled: hoursValue,
      providerArrived: arrivedValue,
      customerNoShow: noShowValue,
    });

    return { bookingId, refundAmount, adminActionId, customerRefundAmount };
  });

  // BUG-PHASE26-01 fix: post-commit PayMongo refund. Without this,
  // admin force-cancel debited platform_escrow but never returned
  // the customer's money to their bank. Mirrors the dispute-resolve
  // pattern (escrow.service.ts lines ~564-572) — failure enqueues to
  // gateway_retry_queue rather than blocking the cancellation.
  if (!noShowValue && trxResult.customerRefundAmount > 0) {
    const totalCustomerRefund = trxResult.customerRefundAmount + serviceFee;
    // gate-c-allowed: post-commit-gateway-refund
    try {
      await paymentService.processRefund(
        bookingId,
        totalCustomerRefund,
        `Admin cancellation: ${trimmedReason.slice(0, 100)}`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/no payment found/i.test(errMsg)) {
        logger.info('Admin-cancel refund skipped — no PayMongo intent for booking', {
          bookingId, totalCustomerRefund,
        });
      } else {
        logger.error('PayMongo admin-cancel refund failed (post-commit); enqueueing retry', {
          bookingId, totalCustomerRefund, error: errMsg,
        });
        await gatewayRetryService.enqueueRetry({
          actionType: 'refund_from_escrow',
          bookingId,
          amountCentavos: totalCustomerRefund,
          description: 'Admin cancellation refund',
          initialError: errMsg,
        });
      }
    }
  }

  return trxResult;
}

// ─────────────────────────────────────────────────────────────────
// 9) Force complete booking (super-admin, very rare)
// ─────────────────────────────────────────────────────────────────

export async function forceCompleteBooking(
  bookingId: string,
  reason: string,
  adminUserId: string,
): Promise<ForceCompleteResult> {
  const trimmedReason = requireReason(reason, 20);

  return db.transaction(async (client) => {
    const bookingResult = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId],
    );
    const booking = bookingResult.rows[0];
    if (!booking) throw createAppError('Booking not found.', 404);
    if (!FORCE_COMPLETE_ALLOWED.has(booking.status)) {
      throw createAppError(
        `Cannot force-complete booking in status "${booking.status}".`,
        409,
      );
    }

    await client.query(
      `UPDATE bookings
          SET status = 'confirmed',
              confirmed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [bookingId],
    );

    // MED-N10 fix: pre-fix the function set status='confirmed' and
    // returned. autoConfirmBookings (workers.ts) only picks up
    // bookings whose `completed_at < NOW() - 24h`, so the provider
    // waited up to a full day after explicit admin force-complete
    // to actually receive their money. Now: release escrow + flip
    // to 'payout_ready' inside the SAME transaction when the
    // booking has escrow held. Pre-check escrow_status so we don't
    // throw on bookings that never had a payment captured.
    const escrowStatusRow = await client.query<{ escrow_status: string | null }>(
      `SELECT escrow_status FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const escrowStatus = escrowStatusRow.rows[0]?.escrow_status ?? null;
    const releasable = escrowStatus === 'held';
    let escrowReleased = false;
    if (releasable) {
      await escrowService.releaseEscrowInTransaction(client, bookingId);
      await client.query(
        `UPDATE bookings SET status = 'payout_ready', updated_at = NOW() WHERE id = $1`,
        [bookingId],
      );
      escrowReleased = true;
    }

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'booking_force_completed', 'booking', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({ previousStatus: booking.status, escrowReleased }),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record force-complete admin action.', 500);
    }

    logger.info('Booking force-completed by admin', {
      bookingId,
      previousStatus: booking.status,
      adminUserId,
      adminActionId,
      escrowReleased,
    });

    return { bookingId, adminActionId };
  });
}


// ─────────────────────────────────────────────────────────────────
// 10) Admin → customer message (Phase 13 — dispatch console)
// ─────────────────────────────────────────────────────────────────

export interface AdminMessageResult {
  bookingId: string;
  customerId: string;
  conversationId: string | null;
  messageId: string | null;
  notificationId: string;
}

/**
 * Sends an admin-originated message to the customer associated with a
 * booking. Used by the dispatch console "Message customer" action.
 *
 * Behavior:
 *  - Always creates a `notifications` row (type `new_message`) so the
 *    customer is notified through the normal channel.
 *  - If a `conversations` row exists for the booking, also inserts a
 *    `messages` row with `message_type = system` and the admin as sender
 *    so the message appears inline in the customer's chat thread.
 *  - HTTP-layer audit (auditMiddleware on POST) captures the admin
 *    action; since migration 058 added the `admin_message_sent` verb and
 *    `message` target_type to the admin_actions CHECK constraints, an
 *    `admin_actions` row IS now also written here (best-effort: the
 *    insert is wrapped so a failure never aborts the message send).
 */
export async function sendAdminMessageToBookingCustomer(
  bookingId: string,
  message: string,
  adminUserId: string,
): Promise<AdminMessageResult> {
  if (!bookingId || typeof bookingId !== 'string') {
    throw createAppError('bookingId is required.', 400);
  }
  if (!adminUserId || typeof adminUserId !== 'string') {
    throw createAppError('adminUserId is required.', 400);
  }
  const trimmed = (message ?? '').trim();
  if (trimmed.length < 5 || trimmed.length > 2000) {
    throw createAppError('message must be 5–2000 characters.', 400);
  }

  interface BookingRow { id: string; customer_id: string }
  const bookingResult = await db.query<BookingRow>(
    `SELECT id, customer_id FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  interface ConversationLookupRow { id: string }
  const conversationResult = await db.query<ConversationLookupRow>(
    `SELECT id FROM conversations WHERE booking_id = $1`,
    [bookingId],
  );
  const conversationId = conversationResult.rows[0]?.id ?? null;

  let messageId: string | null = null;
  if (conversationId) {
    interface MessageInsertRow { id: string }
    const insertResult = await db.query<MessageInsertRow>(
      `INSERT INTO messages
         (conversation_id, sender_id, content, message_type, image_url, is_flagged)
       VALUES ($1, $2, $3, 'system', NULL, FALSE)
       RETURNING id`,
      [conversationId, adminUserId, trimmed],
    );
    messageId = insertResult.rows[0]?.id ?? null;
    await db.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );
  }

  const notification = await notificationService.createPushNotification({
    userId: booking.customer_id,
    type: 'new_message',
    title: 'Message from onService support',
    body: trimmed.slice(0, 200),
    data: {
      bookingId,
      conversationId,
      messageId,
      source: 'admin_dispatch_console',
      adminUserId,
    },
  });

  logger.info('Admin sent message to booking customer', {
    bookingId,
    customerId: booking.customer_id,
    adminUserId,
    conversationId,
    messageId,
    notificationId: notification.id,
    bodyLength: trimmed.length,
  });

  // gate-c-allowed: best-effort-audit-only — wrapped in try/catch with logger.warn on failure; message already durably inserted above
  try {
    await db.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'admin_message_sent', 'message', $2, $3::jsonb)`,
      [
        adminUserId,
        messageId ?? bookingId,
        JSON.stringify({
          bookingId,
          customerId: booking.customer_id,
          conversationId,
          messageId,
          notificationId: notification.id,
          bodyLength: trimmed.length,
        }),
      ],
    );
  } catch (err) {
    logger.warn('audit_log insert failed', { err: String(err) });
  }

  return {
    bookingId,
    customerId: booking.customer_id,
    conversationId,
    messageId,
    notificationId: notification.id,
  };
}
