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
import * as socketService from './socket.service';
import * as matchingService from './matching.service';
import * as financialTermsService from './booking-financial-terms.service';
import { maskEmail, maskPhilippinePhone, type ActorRole } from '../utils/pii-mask';
import { canTransition, type BookingStatus } from '../types/booking.types';

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
  conversationId: string | null;
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

export interface BookingMoney {
  paymentIntents: Array<{
    id: string;
    gatewayIntentId: string | null;
    gatewayPaymentId: string | null;
    amount: number;
    refundedAmount: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  ledgerEntries: Array<{
    id: string;
    walletType: string;
    walletUserId: string | null;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId: string | null;
    createdAt: string;
  }>;
  salesRecords: Array<{
    id: string;
    number: string;
    grossAmount: number;
    providerReceived: number;
    platformRetained: number;
    isCancellation: boolean;
    cancelledAt: string | null;
    pdfUrl: string | null;
    issuedAt: string;
  }>;
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
  supportTicketId: string;
  remainingEscrowAmount: number;
  customerWalletCredited: boolean;
  idempotentReplay: boolean;
  paymentProcessingQueued: boolean;
  paymentProcessingStatus: 'processed' | 'queued' | 'manual_attention';
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
  'provider_arrived',
  'in_progress',
  'completed_by_provider',
  'confirmed',
  'disputed',
  'resolved',
  'cancelled_by_customer',
  'cancelled_by_provider',
  'cancelled_by_admin',
  'paid_out',
  'payout_ready',
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

export async function getBookingDetail(
  bookingId: string,
  actorRole: ActorRole = 'admin',
): Promise<BookingDetail> {
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
    conversation_id: string | null;
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
            c.id                  AS conversation_id,
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
       LEFT JOIN conversations c           ON c.booking_id = b.id
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

  const address = row.address || row.barangay || row.city || row.province
    ? {
        full: row.address ?? '',
        barangay: row.barangay ?? '',
        city: row.city ?? '',
        province: row.province ?? '',
      }
    : null;

  const contactMasked = actorRole !== 'super_admin';
  const customer = row.customer_id
    ? {
        id: row.customer_id,
        fullName: `${row.customer_first_name ?? ''} ${row.customer_last_name ?? ''}`.trim(),
        phone: contactMasked ? maskPhilippinePhone(row.customer_phone) : (row.customer_phone ?? ''),
        email: contactMasked && row.customer_email ? maskEmail(row.customer_email) : row.customer_email,
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
        phone: contactMasked ? maskPhilippinePhone(row.provider_phone) : (row.provider_phone ?? ''),
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
    conversationId: row.conversation_id,
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
// 5) Booking payment and ledger trail (read-only)
// ─────────────────────────────────────────────────────────────────

export async function getBookingMoney(bookingId: string): Promise<BookingMoney> {
  const booking = await db.query<{ id: string }>(
    `SELECT id FROM bookings WHERE id = $1`,
    [bookingId],
  );
  if (!booking.rows[0]) throw createAppError('Booking not found.', 404);

  const [paymentResult, ledgerResult, salesResult] = await Promise.all([
    db.query<{
      id: string;
      paymongo_intent_id: string | null;
      paymongo_payment_id: string | null;
      amount: string;
      refunded_amount: string;
      payment_method: string;
      status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, paymongo_intent_id, paymongo_payment_id,
              amount::text, refunded_amount::text, payment_method, status,
              created_at, updated_at
         FROM payment_intents
        WHERE booking_id = $1
        ORDER BY created_at DESC`,
      [bookingId],
    ),
    db.query<{
      id: string;
      wallet_type: string;
      wallet_user_id: string | null;
      type: string;
      amount: string;
      balance_after: string;
      description: string;
      reference_id: string | null;
      created_at: Date;
    }>(
      `SELECT wt.id, w.type AS wallet_type, w.user_id AS wallet_user_id,
              wt.type, wt.amount::text, wt.balance_after::text,
              wt.description, wt.reference_id, wt.created_at
         FROM wallet_transactions wt
         JOIN wallets w ON w.id = wt.wallet_id
        WHERE wt.booking_id = $1
        ORDER BY wt.created_at ASC, wt.id ASC`,
      [bookingId],
    ),
    db.query<{
      id: string;
      or_number: string;
      gross_amount: string;
      provider_received: string;
      platform_retained: string;
      is_cancellation: boolean;
      cancelled_at: Date | null;
      pdf_url: string | null;
      issued_at: Date;
    }>(
      `SELECT id, or_number, gross_amount::text, provider_received::text,
              platform_retained::text, is_cancellation, cancelled_at,
              pdf_url, issued_at
         FROM official_receipts
        WHERE booking_id = $1
        ORDER BY issued_at ASC, id ASC`,
      [bookingId],
    ),
  ]);

  return {
    paymentIntents: paymentResult.rows.map((row) => ({
      id: row.id,
      gatewayIntentId: row.paymongo_intent_id,
      gatewayPaymentId: row.paymongo_payment_id,
      amount: Number(row.amount),
      refundedAmount: Number(row.refunded_amount),
      paymentMethod: row.payment_method,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    })),
    ledgerEntries: ledgerResult.rows.map((row) => ({
      id: row.id,
      walletType: row.wallet_type,
      walletUserId: row.wallet_user_id,
      type: row.type,
      amount: Number(row.amount),
      balanceAfter: Number(row.balance_after),
      description: row.description,
      referenceId: row.reference_id,
      createdAt: row.created_at.toISOString(),
    })),
    salesRecords: salesResult.rows.map((row) => ({
      id: row.id,
      number: row.or_number,
      grossAmount: Number(row.gross_amount),
      providerReceived: Number(row.provider_received),
      platformRetained: Number(row.platform_retained),
      isCancellation: row.is_cancellation,
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      pdfUrl: row.pdf_url,
      issuedAt: row.issued_at.toISOString(),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// 6) Manual escrow release (SACRED — super-admin only at route layer)
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
      Number(breakdown.providerReceives ?? 0)
      + Number(breakdown.platformRetains ?? 0)
      + Number(breakdown.guaranteeFundContribution ?? 0);

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
  supportTicketId: string,
  idempotencyKey: string,
): Promise<RefundResult> {
  if (
    !Number.isFinite(refundAmount) ||
    !Number.isInteger(refundAmount) ||
    refundAmount <= 0
  ) {
    throw createAppError('refundAmount must be a positive integer (centavos).', 400);
  }
  const trimmedReason = requireReason(reason, 10);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(supportTicketId)) {
    throw createAppError('supportTicketId must be a valid UUID.', 400);
  }
  if (!uuidPattern.test(idempotencyKey)) {
    throw createAppError('idempotencyKey must be a valid UUID.', 400);
  }

  // Phase 14 Dispatch 06 — Bug 71. Pre-D06 the escrow refund ran in
  // escrowService.refundFromEscrow's internal transaction, then the
  // admin_actions audit ran in a SEPARATE top-level db.query. If the
  // audit insert failed, the customer wallet had been credited (via
  // escrow pending_balance debit) without an audit trail. Now: ONE
  // outer transaction wraps the trx-aware refund helper + the
  // admin_actions INSERT. Gateway refund (paymentService.processRefund)
  // stays post-commit per the documented pattern. Its retry action never
  // repeats the already-committed escrow movement.
  const result = await db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [idempotencyKey]);
    const replayResult = await client.query<{
      id: string;
      details: Record<string, unknown>;
      reason: string;
    }>(
      `SELECT id, details, reason
         FROM admin_actions
        WHERE action_type = 'refund_issued'
          AND details ->> 'idempotencyKey' = $1
        LIMIT 1`,
      [idempotencyKey],
    );
    const replay = replayResult.rows[0];
    if (replay) {
      if (String(replay.details.bookingId) !== bookingId) {
        throw createAppError('This refund request key belongs to a different booking.', 409);
      }
      if (
        Number(replay.details.refundAmount) !== refundAmount
        || String(replay.details.supportTicketId) !== supportTicketId
        || replay.reason !== trimmedReason
      ) {
        throw createAppError('This refund request key was already used with different parameters.', 409);
      }
      const paymentRetryId = String(replay.details.paymentRetryId ?? '');
      const retryStatus = paymentRetryId
        ? await client.query<{ status: string }>(
            'SELECT status FROM gateway_retry_queue WHERE id = $1',
            [paymentRetryId],
          )
        : null;
      const persistedRetryStatus = retryStatus?.rows[0]?.status;
      const paymentProcessingStatus: RefundResult['paymentProcessingStatus'] = persistedRetryStatus === 'succeeded'
        ? 'processed'
        : persistedRetryStatus === 'pending' || persistedRetryStatus === 'in_progress'
          ? 'queued'
          : 'manual_attention';
      return {
        adminActionId: replay.id,
        supportTicketId: String(replay.details.supportTicketId),
        remainingEscrowAmount: Number(replay.details.remainingEscrowAmount),
        customerWalletCredited: replay.details.customerWalletCredited === true,
        idempotentReplay: true,
        paymentRetryId,
        paymentProcessingQueued: paymentProcessingStatus === 'queued',
        paymentProcessingStatus,
      };
    }

    const ticketResult = await client.query<{ id: string; ticket_number: string }>(
      `SELECT id, ticket_number
         FROM support_tickets
        WHERE id = $1
          AND booking_id = $2
          AND status NOT IN ('resolved', 'closed')
        FOR SHARE`,
      [supportTicketId, bookingId],
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      throw createAppError('Select an active support case linked to this booking before issuing a refund.', 409);
    }

    const movement = await escrowService.refundFromEscrowInTransaction(
      client,
      bookingId,
      refundAmount,
      trimmedReason,
    );
    const nextEscrowStatus = movement.remainingEscrowCentavos === 0
      ? 'refunded'
      : 'partially_refunded';
    await client.query(
      `UPDATE bookings SET escrow_status = $2, updated_at = NOW() WHERE id = $1`,
      [bookingId, nextEscrowStatus],
    );

    // Durable outbox: create the payment-only work item before the local
    // refund commits. A process stop between COMMIT and the immediate gateway
    // call can no longer strand the customer refund. The worker never repeats
    // the escrow debit.
    const retryResult = await client.query<{ id: string }>(
      `INSERT INTO gateway_retry_queue
         (action_type, booking_id, amount_centavos, description, last_error, status, next_retry_at)
       VALUES ('process_payment_refund', $1, $2, $3, $4, 'pending', NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [bookingId, refundAmount, trimmedReason, 'Initial payment refund attempt pending'],
    );
    const paymentRetryId = retryResult.rows[0]?.id;
    if (!paymentRetryId) {
      throw createAppError('Failed to create durable payment refund operation.', 500);
    }

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'refund_issued', 'booking', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({
          bookingId,
          refundAmount,
          supportTicketId,
          supportTicketNumber: ticket.ticket_number,
          idempotencyKey,
          remainingEscrowAmount: movement.remainingEscrowCentavos,
          customerWalletCredited: movement.customerWalletCredited,
          paymentMethod: movement.paymentMethod,
          nextEscrowStatus,
          paymentRetryId,
        }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record refund admin action.', 500);
    }

    await client.query(
      `INSERT INTO support_ticket_messages
         (ticket_id, sender_id, sender_role, message, is_internal_note)
       VALUES ($1, $2, 'super_admin', $3, TRUE)`,
      [
        supportTicketId,
        adminUserId,
        `Refund issued: ${refundAmount} centavos. Remaining booking escrow: ${movement.remainingEscrowCentavos} centavos. Admin action: ${adminActionId}. Reason: ${trimmedReason}`,
      ],
    );
    await client.query(
      `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
      [supportTicketId],
    );

    return {
      adminActionId,
      supportTicketId,
      remainingEscrowAmount: movement.remainingEscrowCentavos,
      customerWalletCredited: movement.customerWalletCredited,
      idempotentReplay: false,
      paymentRetryId,
      paymentProcessingQueued: true,
      paymentProcessingStatus: 'queued' as const,
    };
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
  let paymentProcessingQueued = result.paymentProcessingQueued;
  let paymentProcessingStatus = result.paymentProcessingStatus;
  if (!result.idempotentReplay) {
    try {
      await paymentService.processRefund(bookingId, refundAmount, trimmedReason);
      try {
        const marked = await db.query(
          `UPDATE gateway_retry_queue
              SET status = 'succeeded', attempts = 1, last_attempted_at = NOW(),
                  succeeded_at = NOW(), updated_at = NOW(), last_error = NULL
            WHERE id = $1 AND status = 'pending'`,
          [result.paymentRetryId],
        );
        if ((marked.rowCount ?? 0) === 1) {
          paymentProcessingQueued = false;
          paymentProcessingStatus = 'processed';
        } else {
          paymentProcessingQueued = false;
          paymentProcessingStatus = 'manual_attention';
          logger.error('Payment refund succeeded but its durable operation was not pending', {
            bookingId,
            paymentRetryId: result.paymentRetryId,
          });
        }
      } catch (markErr) {
        paymentProcessingQueued = false;
        paymentProcessingStatus = 'manual_attention';
        logger.error('Payment refund succeeded but its durable operation could not be marked succeeded', {
          bookingId,
          paymentRetryId: result.paymentRetryId,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (result.customerWalletCredited && /no payment found/i.test(error)) {
        logger.info('Wallet admin refund completed without a payment-intent row', {
          bookingId,
          refundAmount,
        });
        try {
          const marked = await db.query(
            `UPDATE gateway_retry_queue
                SET status = 'succeeded', attempts = 1, last_attempted_at = NOW(),
                    succeeded_at = NOW(), updated_at = NOW(), last_error = NULL
              WHERE id = $1 AND status = 'pending'`,
            [result.paymentRetryId],
          );
          if ((marked.rowCount ?? 0) === 1) {
            paymentProcessingQueued = false;
            paymentProcessingStatus = 'processed';
          } else {
            paymentProcessingQueued = false;
            paymentProcessingStatus = 'manual_attention';
            logger.error('Wallet refund completed but its durable operation was not pending', {
              bookingId,
              paymentRetryId: result.paymentRetryId,
            });
          }
        } catch (markErr) {
          paymentProcessingQueued = false;
          paymentProcessingStatus = 'manual_attention';
          logger.error('Wallet refund completed but its durable operation could not be marked succeeded', {
            bookingId,
            paymentRetryId: result.paymentRetryId,
            error: markErr instanceof Error ? markErr.message : String(markErr),
          });
        }
      } else {
        logger.error('Payment refund processing failed after escrow + audit committed; durable retry remains pending', {
          bookingId,
          refundAmount,
          paymentRetryId: result.paymentRetryId,
          error,
        });
        try {
          await db.query(
            `UPDATE gateway_retry_queue
                SET attempts = 1, last_attempted_at = NOW(), last_error = $2,
                    next_retry_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
              WHERE id = $1 AND status = 'pending'`,
            [result.paymentRetryId, error.slice(0, 2000)],
          );
        } catch (markErr) {
          logger.error('Durable payment refund retry exists but its initial error could not be recorded', {
            bookingId,
            paymentRetryId: result.paymentRetryId,
            error: markErr instanceof Error ? markErr.message : String(markErr),
          });
        }
        paymentProcessingQueued = true;
        paymentProcessingStatus = 'queued';
      }
    }
  }

  return {
    bookingId,
    refundedAmount: refundAmount,
    reason: trimmedReason,
    adminActionId: result.adminActionId,
    supportTicketId: result.supportTicketId,
    remainingEscrowAmount: result.remainingEscrowAmount,
    customerWalletCredited: result.customerWalletCredited,
    idempotentReplay: result.idempotentReplay,
    paymentProcessingQueued,
    paymentProcessingStatus,
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

  const result = await db.transaction(async (client) => {
    const bookingResult = await client.query<{
      id: string;
      status: string;
      customer_id: string;
      provider_id: string | null;
      performer_staff_id: string | null;
      old_provider_user_id: string | null;
      category_id: string;
      subcategory_id: string | null;
      latitude: string | null;
      longitude: string | null;
      scheduled_at: Date | null;
    }>(
      `SELECT id, status, customer_id, provider_id, performer_staff_id,
              category_id, subcategory_id, latitude, longitude, scheduled_at,
              (SELECT user_id FROM providers WHERE id = bookings.provider_id) AS old_provider_user_id
         FROM bookings WHERE id = $1 FOR UPDATE`,
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

    if (booking.provider_id === newProviderId) {
      throw createAppError('Booking is already assigned to this provider.', 409);
    }

    if (booking.latitude === null || booking.longitude === null) {
      throw createAppError(
        'Booking has no exact location coordinates. Correct the booking location before reassignment.',
        409,
      );
    }

    const providerResult = await client.query<{
      id: string;
      user_id: string;
      status: string;
      is_active: boolean;
      is_available: boolean;
      service_eligible: boolean;
      in_range: boolean;
    }>(
      `SELECT p.id, p.user_id, p.status, u.is_active, p.is_available,
              EXISTS (
                SELECT 1
                  FROM provider_services ps
                 WHERE ps.provider_id = p.id
                   AND ps.is_active = TRUE
                   AND ps.category_id = $2
                   AND ($3::uuid IS NULL OR ps.subcategory_id IS NULL OR ps.subcategory_id = $3)
              ) AS service_eligible,
              CASE
                WHEN p.latitude IS NULL OR p.longitude IS NULL OR p.service_radius_km IS NULL
                  THEN FALSE
                ELSE (
                  6371 * ACOS(LEAST(1.0, GREATEST(-1.0,
                    COS(RADIANS($4::numeric)) * COS(RADIANS(p.latitude::numeric))
                      * COS(RADIANS(p.longitude::numeric) - RADIANS($5::numeric))
                      + SIN(RADIANS($4::numeric)) * SIN(RADIANS(p.latitude::numeric))
                  )))
                ) <= p.service_radius_km
              END AS in_range
         FROM providers p
         JOIN users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [
        newProviderId,
        booking.category_id,
        booking.subcategory_id,
        booking.latitude,
        booking.longitude,
      ],
    );
    const provider = providerResult.rows[0];
    if (!provider) throw createAppError('New provider not found.', 404);
    if (!provider.is_active) {
      throw createAppError('New provider is not active.', 409);
    }
    if (provider.status !== 'approved') {
      throw createAppError('New provider is not approved.', 409);
    }
    if (!provider.is_available) {
      throw createAppError('New provider is not accepting work.', 409);
    }
    if (!provider.service_eligible) {
      throw createAppError('New provider does not offer this booking\'s service.', 409);
    }
    if (!provider.in_range) {
      throw createAppError('Booking is outside the new provider\'s service radius.', 409);
    }

    if (booking.scheduled_at) {
      const hasConflict = await matchingService.hasBookingConflict(
        newProviderId,
        booking.scheduled_at,
        undefined,
        bookingId,
      );
      if (hasConflict) {
        throw createAppError(
          'New provider already has an overlapping booking. Choose another provider or reschedule the job.',
          409,
        );
      }
    }

    await client.query(
      `UPDATE bookings
          SET provider_id = $1,
              performer_staff_id = NULL,
              updated_at = NOW()
        WHERE id = $2`,
      [newProviderId, bookingId],
    );

    const conversationResult = await client.query(
      `UPDATE conversations
          SET provider_id = $1, updated_at = NOW()
        WHERE booking_id = $2 AND provider_id IS DISTINCT FROM $1`,
      [provider.user_id, bookingId],
    );

    const offersResult = await client.query(
      `UPDATE booking_offers
          SET status = 'cancelled', responded_at = NOW()
        WHERE booking_id = $1 AND status = 'pending'`,
      [bookingId],
    );

    const actionResult = await client.query<{ id: string }>(
       `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
        VALUES ($1, 'booking_reassigned', 'booking', $2, $3::jsonb, $4, $5)
        RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({
          oldProviderId: booking.provider_id,
          newProviderId,
          clearedPerformerStaffId: booking.performer_staff_id,
          conversationParticipantUpdated: (conversationResult.rowCount ?? 0) > 0,
          pendingOffersCancelled: offersResult.rowCount ?? 0,
        }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record reassign admin action.', 500);
    }

    // E50: a reassignment changes which provider agreement governs future
    // disbursement. Append a new immutable version in the same transaction;
    // pre-payment reassignments intentionally have no financial terms yet.
    await financialTermsService.appendProviderAssignmentTermsInTransaction(
      client,
      {
        bookingId,
        providerId: newProviderId,
        event: 'provider_reassigned',
        sourceEventId: adminActionId,
        createdBy: adminUserId,
        metadata: {
          oldProviderId: booking.provider_id,
          reason: trimmedReason,
        },
      },
    );

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
      customerId: booking.customer_id,
      oldProviderUserId: booking.old_provider_user_id,
      newProviderUserId: provider.user_id,
    };
  });

  const notices = [
    notificationService.createPushNotification({
      userId: result.customerId,
      type: 'provider_assigned',
      title: 'Your service provider changed',
      body: 'onService support reassigned your booking. Open the booking for the current provider and updates.',
      data: { bookingId, source: 'admin_reassignment' },
    }),
    notificationService.createPushNotification({
      userId: result.newProviderUserId,
      type: 'provider_assigned',
      title: 'Booking assigned by onService support',
      body: 'A booking has been assigned to your provider account. Review it before travelling.',
      data: { bookingId, source: 'admin_reassignment' },
    }),
  ];
  if (result.oldProviderUserId && result.oldProviderUserId !== result.newProviderUserId) {
    notices.push(notificationService.createPushNotification({
      userId: result.oldProviderUserId,
      type: 'provider_assigned',
      title: 'Booking reassigned by onService support',
      body: 'You no longer have access to this booking or its customer conversation.',
      data: { bookingId, source: 'admin_reassignment' },
    }));
  }
  const noticeResults = await Promise.allSettled(notices);
  if (noticeResults.some((notice) => notice.status === 'rejected')) {
    logger.warn('One or more booking reassignment notifications failed', { bookingId });
  }
  socketService.emitAdminEvent(socketService.ADMIN_EVENTS.BOOKING_PROVIDER_ASSIGNED, {
    id: bookingId,
    oldProviderId: result.oldProviderId,
    newProviderId,
  });

  return {
    bookingId: result.bookingId,
    oldProviderId: result.oldProviderId,
    newProviderId: result.newProviderId,
    adminActionId: result.adminActionId,
  };
}

// ─────────────────────────────────────────────────────────────────
// 8) Cancel booking as admin
// ─────────────────────────────────────────────────────────────────

export async function cancelBookingAsAdmin(
  bookingId: string,
  reason: string,
  adminUserId: string,
  hoursUntilScheduled?: unknown,
  providerArrived?: unknown,
  customerNoShow?: unknown,
): Promise<CancelResult> {
  const trimmedReason = requireReason(reason, 10);

  if (hoursUntilScheduled !== undefined
    && (typeof hoursUntilScheduled !== 'number' || !Number.isFinite(hoursUntilScheduled))) {
    throw createAppError('hoursUntilScheduled must be a finite number when provided.', 400);
  }
  if (providerArrived !== undefined && typeof providerArrived !== 'boolean') {
    throw createAppError('providerArrived must be a boolean when provided.', 400);
  }
  if (customerNoShow !== undefined && typeof customerNoShow !== 'boolean') {
    throw createAppError('customerNoShow must be a boolean when provided.', 400);
  }
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
  if (!canTransition(booking.status as BookingStatus, 'cancelled_by_admin')) {
    throw createAppError(
      `Cannot cancel booking in status "${booking.status}". Use the canonical dispute or settlement workflow for completed money states.`,
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
          actionType: 'process_payment_refund',
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
    // booking has escrow held. A prior operator partial refund still leaves a
    // provider/platform remainder that must be released here. Pre-check
    // escrow_status so we don't throw on bookings that never had a payment
    // captured.
    const escrowStatusRow = await client.query<{ escrow_status: string | null }>(
      `SELECT escrow_status FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const escrowStatus = escrowStatusRow.rows[0]?.escrow_status ?? null;
    const releasable = escrowStatus === 'held' || escrowStatus === 'partially_refunded';
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
  providerUserId: string | null;
  conversationId: string | null;
  messageId: string | null;
  customerNotificationId: string | null;
  providerNotificationId: string | null;
}

/**
 * Posts an admin-originated support update to the booking participants.
 *
 * Behavior:
 *  - When a provider is assigned, creates or reuses the canonical booking
 *    conversation and inserts one system message visible to both parties.
 *  - The message and booking-targeted admin action commit atomically.
 *  - Participant inbox/push notifications and socket wake-ups happen after
 *    commit. They never manufacture a second support thread.
 *  - Before provider assignment, the update is customer-only because no
 *    customer/provider conversation can truthfully exist yet.
 */
export async function sendAdminMessageToBookingParticipants(
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

  const durable = await db.transaction(async (client) => {
    const bookingResult = await client.query<{
      id: string;
      customer_id: string;
      provider_user_id: string | null;
    }>(
      `SELECT b.id, b.customer_id, p.user_id AS provider_user_id
         FROM bookings b
         LEFT JOIN providers p ON p.id = b.provider_id
        WHERE b.id = $1
        FOR UPDATE OF b`,
      [bookingId],
    );
    const booking = bookingResult.rows[0];
    if (!booking) throw createAppError('Booking not found.', 404);

    let conversationId: string | null = null;
    let messageId: string | null = null;
    if (booking.provider_user_id) {
      const conversationResult = await client.query<{ id: string }>(
        `INSERT INTO conversations (booking_id, customer_id, provider_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (booking_id) DO UPDATE
           SET customer_id = EXCLUDED.customer_id,
               provider_id = EXCLUDED.provider_id,
               updated_at = NOW()
         RETURNING id`,
        [bookingId, booking.customer_id, booking.provider_user_id],
      );
      conversationId = conversationResult.rows[0]?.id ?? null;
      if (!conversationId) throw createAppError('Failed to resolve booking conversation.', 500);

      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO messages
           (conversation_id, sender_id, content, message_type, image_url, is_flagged)
         VALUES ($1, $2, $3, 'system', NULL, FALSE)
         RETURNING id`,
        [conversationId, adminUserId, trimmed],
      );
      messageId = insertResult.rows[0]?.id ?? null;
      if (!messageId) throw createAppError('Failed to record support message.', 500);
    }

    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'admin_message_sent', 'booking', $2, $3::jsonb)
       RETURNING id`,
      [
        adminUserId,
        bookingId,
        JSON.stringify({
          bookingId,
          customerId: booking.customer_id,
          providerUserId: booking.provider_user_id,
          conversationId,
          messageId,
          audience: booking.provider_user_id ? 'booking_participants' : 'customer_only',
          bodyLength: trimmed.length,
        }),
      ],
    );
    if (!actionResult.rows[0]?.id) throw createAppError('Failed to record support-message audit.', 500);

    return {
      customerId: booking.customer_id,
      providerUserId: booking.provider_user_id,
      conversationId,
      messageId,
    };
  });

  const notificationRequests = [
    notificationService.createPushNotification({
      userId: durable.customerId,
      type: 'new_message',
      title: 'Message from onService support',
      body: trimmed.slice(0, 200),
      data: {
        bookingId,
        conversationId: durable.conversationId,
        messageId: durable.messageId,
        source: 'admin_booking_support',
      },
    }),
  ];
  if (durable.providerUserId) {
    notificationRequests.push(notificationService.createPushNotification({
      userId: durable.providerUserId,
      type: 'new_message',
      title: 'Message from onService support',
      body: trimmed.slice(0, 200),
      data: {
        bookingId,
        conversationId: durable.conversationId,
        messageId: durable.messageId,
        source: 'admin_booking_support',
      },
    }));
  }
  const notificationResults = await Promise.allSettled(notificationRequests);
  const customerNotificationId = notificationResults[0]?.status === 'fulfilled'
    ? notificationResults[0].value.id
    : null;
  const providerNotificationId = notificationResults[1]?.status === 'fulfilled'
    ? notificationResults[1].value.id
    : null;
  if (notificationResults.some((result) => result.status === 'rejected')) {
    logger.warn('Booking support message notification failed after durable message commit', { bookingId });
  }

  if (durable.conversationId && durable.messageId) {
    const socketMessage = {
      id: durable.messageId,
      conversationId: durable.conversationId,
      senderId: adminUserId,
      senderName: 'onService Support',
      senderRole: 'admin',
      content: trimmed,
      messageType: 'system',
      imageUrl: null,
      isRead: false,
      isFlagged: false,
      createdAt: new Date().toISOString(),
    };
    socketService.emitToConversation(durable.conversationId, 'new:message', socketMessage);
    socketService.emitToUser(durable.customerId, 'notification:message', {
      conversationId: durable.conversationId,
      message: socketMessage,
    });
    if (durable.providerUserId) {
      socketService.emitToUser(durable.providerUserId, 'notification:message', {
        conversationId: durable.conversationId,
        message: socketMessage,
      });
    }
  }

  logger.info('Admin sent support message to booking participants', {
    bookingId,
    customerId: durable.customerId,
    providerUserId: durable.providerUserId,
    adminUserId,
    conversationId: durable.conversationId,
    messageId: durable.messageId,
    customerNotificationId,
    providerNotificationId,
    bodyLength: trimmed.length,
  });

  return {
    bookingId,
    customerId: durable.customerId,
    providerUserId: durable.providerUserId,
    conversationId: durable.conversationId,
    messageId: durable.messageId,
    customerNotificationId,
    providerNotificationId,
  };
}

// Backward-compatible internal alias for earlier callers and audit tests.
export const sendAdminMessageToBookingCustomer = sendAdminMessageToBookingParticipants;
