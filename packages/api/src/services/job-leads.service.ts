/**
 * D27 Phase 1 — custom-quote lead discovery, rebuilt for D38 (Ken,
 * 2026-10-13): the first-response request engine (Milestone 2 plan,
 * qa-frameworks/human-audit-2026-10-13/merged.md P2 algorithm 5, with the
 * critique.md corrections).
 *
 *   notifyProvidersOfJobRequest  the fan-out: rank eligible, online providers
 *       with the fixed-price matcher's own ranking, take the best
 *       request_max_invites, record each invite under a guarded transaction,
 *       and push only to invites that were actually inserted (so running it
 *       twice pushes once). Round 1 with nobody to notify flags the request
 *       for the back office.
 *   closeRequest  closes open invites when a request is taken, accepted,
 *       cancelled or expired, and tells providers holding a live quote on a
 *       cancelled request.
 *   getOpenJobRequestsForProvider / getOpenJobRequestForProvider  the
 *       provider's Requests list and request detail. Visibility is
 *       eligibility-based (merged plan conflict 15): every eligible provider
 *       sees an open request whose live quotes are under the cap. The detail
 *       also serves a provider who already quoted, read-only (critique M6).
 *       Both are side-effect free; the route marks the invite viewed.
 *   getRequestSummary / getMyQuotes  the Requests tab badge and My quotes.
 *
 * Quotes stay pull-based: a provider is told about a request and chooses to
 * quote. Every push and socket event runs after the database work and is
 * best effort.
 */
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError, type AppError } from '../middleware/error.middleware';
import { formatPHP } from '../utils/currency';
import * as notificationService from './notification.service';
import * as socketService from './socket.service';
import * as settingsService from './settings.service';
import { rankCandidates, type MatchableProvider } from './matching.service';
import { providerEligibleForRequestSql, requestDistanceKmSql } from './booking/request-eligibility';
import { liveQuoteCountSql } from './booking/request-stage';
import {
  REALTIME_EVENTS,
  type JobRequestClosedReason,
  type JobRequestMediaCounts,
  type NewJobRequestPayload,
} from './realtime-events';

/** Candidate rows read before ranking: a safety bound, not a product limit. */
const FAN_OUT_CANDIDATE_LIMIT = 500;

/** Customer decline reasons (migration 183) and the label providers see. */
export const DECLINE_REASON_LABELS: Readonly<Record<string, string>> = {
  too_expensive: 'Price too high',
  timing: 'Timing did not work',
  changed_mind: 'Customer changed their mind',
  other: 'Other reason',
};

export function declineReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return DECLINE_REASON_LABELS[reason] ?? DECLINE_REASON_LABELS.other!;
}

/** "Ana R." from first and last name; the full surname is shown only after booking. */
export function shortCustomerName(first: string | null | undefined, last: string | null | undefined): string {
  const firstName = (first ?? '').trim();
  const lastInitial = (last ?? '').trim().charAt(0).toUpperCase();
  if (firstName && lastInitial) return `${firstName} ${lastInitial}.`;
  if (firstName) return firstName;
  if (lastInitial) return `${lastInitial}.`;
  return 'Customer';
}

function appError(message: string, statusCode: number, code: string): AppError {
  return Object.assign(createAppError(message, statusCode), { code });
}

function emitToUserSafely(userId: string, event: string, payload: unknown): void {
  try {
    socketService.emitToUser?.(userId, event, payload);
  } catch (err) {
    logger.warn('Request socket emit failed', { userId, event, err: String(err) });
  }
}

async function mediaCountsFor(bookingId: string): Promise<JobRequestMediaCounts> {
  const result = await db.query<{ photo: number; video: number; voice: number }>(
    `SELECT COUNT(*) FILTER (WHERE kind = 'photo')::int AS photo,
            COUNT(*) FILTER (WHERE kind = 'video')::int AS video,
            COUNT(*) FILTER (WHERE kind = 'voice')::int AS voice
       FROM job_media
      WHERE booking_id = $1 AND status = 'attached' AND purpose = 'job_request'`,
    [bookingId],
  );
  const row = result.rows[0];
  return { photo: Number(row?.photo ?? 0), video: Number(row?.video ?? 0), voice: Number(row?.voice ?? 0) };
}

// ────────────────────────────────────────────────────────────────────
// Fan-out
// ────────────────────────────────────────────────────────────────────

export interface FanOutOptions {
  /** The round being sent. Defaults to the request's current round; a stale round sends nothing. */
  round?: number;
  /**
   * Set when the request reopened. declineReason is the customer's reason
   * when a decline reopened it, and null after a lapse or a withdrawal.
   */
  reopened?: { declineReason: string | null; declinedAmount: number | null };
}

export interface FanOutResult {
  round: number;
  /** Providers left after the eligibility query and the matcher's rating floor. */
  candidates: number;
  /** Invite rows this call inserted. */
  invited: number;
  /** Invites that were pushed. */
  notified: number;
  /** True when this call flagged round 1 as having no eligible provider. */
  opsReviewFlagged: boolean;
}

interface FanOutBookingRow {
  id: string;
  status: string;
  booking_type: string;
  request_round: number;
  city: string | null;
  service_name: string;
}

/**
 * Notify the best-matching approved, online providers about a quote request.
 * Best effort for each provider; the guarded insert makes repeated or
 * concurrent calls for the same round push each provider at most once.
 */
export async function notifyProvidersOfJobRequest(
  booking: { id: string } & Partial<Record<'category_id' | 'latitude' | 'longitude' | 'city', unknown>>,
  opts: FanOutOptions = {},
): Promise<FanOutResult> {
  const policy = await settingsService.getRequestPolicy();
  const infoResult = await db.query<FanOutBookingRow>(
    `SELECT b.id, b.status, b.booking_type, b.request_round, b.city,
            COALESCE(sub.name, sc.name, 'a service') AS service_name
       FROM bookings b
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
      WHERE b.id = $1`,
    [booking.id],
  );
  const info = infoResult.rows[0];
  const round = opts.round ?? info?.request_round ?? 1;
  const nothing: FanOutResult = { round, candidates: 0, invited: 0, notified: 0, opsReviewFlagged: false };
  if (!info || info.booking_type !== 'quote_based' || !['requested', 'quoted'].includes(info.status)
      || Number(info.request_round) !== round) {
    return nothing;
  }

  const distance = requestDistanceKmSql();
  const candidateResult = await db.query<MatchableProvider>(
    `SELECT p.id AS provider_id, p.user_id, p.business_name, p.tier,
            p.rating::float8 AS rating, p.total_jobs, p.total_reviews, p.service_radius_km,
            p.latitude, p.longitude, ${distance}::float8 AS distance_km
       FROM bookings b
       JOIN providers p ON p.status = 'approved' AND p.is_available = TRUE
      WHERE b.id = $1
        AND ${providerEligibleForRequestSql()}
        AND NOT EXISTS (SELECT 1 FROM booking_quotes q WHERE q.booking_id = b.id AND q.provider_id = p.id)
      ORDER BY distance_km ASC, p.id
      LIMIT ${FAN_OUT_CANDIDATE_LIMIT}`,
    [booking.id],
  );
  const ranked = (await rankCandidates(candidateResult.rows)).slice(0, policy.maxInvites);

  if (ranked.length === 0) {
    let opsReviewFlagged = false;
    if (round === 1) {
      const flagged = await db.query(
        `UPDATE bookings
            SET request_ops_review_at = NOW(),
                request_ops_review_reason = 'no_eligible_providers',
                updated_at = NOW()
          WHERE id = $1 AND request_round = 1 AND request_ops_review_at IS NULL
            AND status IN ('requested', 'quoted')
          RETURNING id`,
        [booking.id],
      );
      opsReviewFlagged = (flagged.rowCount ?? 0) > 0;
    }
    logger.info('Job request fan-out found no provider to notify', { bookingId: booking.id, round, opsReviewFlagged });
    return { ...nothing, opsReviewFlagged };
  }

  // Critique L4 and section 2.7: one advisory lock per request orders
  // concurrent fan-outs, FOR SHARE waits out a quote admission holding the
  // booking FOR UPDATE, and a single INSERT in provider order with ON
  // CONFLICT DO NOTHING RETURNING reports only rows this call created.
  const inserted = await db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [booking.id]);
    const locked = await client.query<{ status: string; request_round: number; live: number }>(
      `SELECT b.status, b.request_round, ${liveQuoteCountSql('b')} AS live
         FROM bookings b WHERE b.id = $1 FOR SHARE`,
      [booking.id],
    );
    const current = locked.rows[0];
    if (!current || !['requested', 'quoted'].includes(current.status)
        || Number(current.request_round) !== round || Number(current.live) >= policy.maxOpenQuotes) {
      return [] as string[];
    }
    const rows = await client.query<{ provider_id: string }>(
      `INSERT INTO job_request_invites (booking_id, provider_id, round, source, rank, score, distance_km)
       SELECT $1, c.provider_id, $2, 'push', c.rank, c.score, c.distance_km
         FROM unnest($3::uuid[], $4::int[], $5::numeric[], $6::numeric[])
              AS c(provider_id, rank, score, distance_km)
        ORDER BY c.provider_id
       ON CONFLICT (booking_id, provider_id, round) DO NOTHING
       RETURNING provider_id`,
      [
        booking.id,
        round,
        ranked.map((r) => r.providerId),
        ranked.map((_, index) => index + 1),
        ranked.map((r) => r.score),
        ranked.map((r) => r.distanceKm),
      ],
    );
    return rows.rows.map((r) => r.provider_id);
  });

  if (inserted.length === 0) {
    return { ...nothing, candidates: ranked.length };
  }

  // Critique 2.7: re-check before pushing. A quote admitted while the invites
  // were being written may have taken the request.
  const recheck = await db.query<{ status: string; request_round: number; live: number }>(
    `SELECT b.status, b.request_round, ${liveQuoteCountSql('b')} AS live FROM bookings b WHERE b.id = $1`,
    [booking.id],
  );
  const now = recheck.rows[0];
  if (!now || !['requested', 'quoted'].includes(now.status) || Number(now.request_round) !== round
      || Number(now.live) >= policy.maxOpenQuotes) {
    logger.info('Job request fan-out skipped pushes: the request changed while invites were written', {
      bookingId: booking.id, round, invited: inserted.length,
    });
    return { ...nothing, candidates: ranked.length, invited: inserted.length };
  }

  const serviceName = info.service_name;
  const city = info.city ?? 'your area';
  const mediaCounts = await mediaCountsFor(booking.id);
  const reopened = opts.reopened ?? null;
  const label = declineReasonLabel(reopened?.declineReason);
  let title = 'New quote request';
  let body = `A customer needs ${serviceName} in ${city}. Tap to send a quote.`;
  let type: 'new_job_request' | 'job_request_reopened' = 'new_job_request';
  if (reopened) {
    type = 'job_request_reopened';
    title = 'Request reopened';
    body = `A customer is looking for another pro: ${serviceName} in ${city}.`;
    if (label) {
      body += ` They declined an earlier quote. Reason: ${label}.`;
      if (policy.showDeclinedAmount && reopened.declinedAmount != null) {
        body += ` Declined amount: ${formatPHP(reopened.declinedAmount)}.`;
      }
    }
  }
  const socketPayload: NewJobRequestPayload = {
    bookingId: booking.id,
    serviceName,
    city,
    round,
    reopened: reopened !== null,
    declineReason: reopened?.declineReason ?? null,
    mediaCounts,
  };

  const userByProvider = new Map(ranked.map((r) => [r.providerId, r.userId]));
  let notified = 0;
  for (const providerId of inserted) {
    const userId = userByProvider.get(providerId);
    if (!userId) continue;
    try {
      await notificationService.sendPushNotification(userId, title, body, type, {
        bookingId: booking.id, serviceName, city, round, reopened: reopened !== null,
      });
      emitToUserSafely(userId, REALTIME_EVENTS.NEW_JOB_REQUEST, socketPayload);
      notified += 1;
    } catch (err) {
      logger.warn('Lead notify failed for provider', { userId, err: String(err) });
    }
  }

  logger.info('Job request fanned out to providers', {
    bookingId: booking.id, round, candidates: ranked.length, invited: inserted.length, notified,
  });
  return { round, candidates: ranked.length, invited: inserted.length, notified, opsReviewFlagged: false };
}

/**
 * Close a request's open invites (sent or viewed) and tell those providers
 * the request left their list. For a cancellation, providers holding a live
 * quote also get a notice. Best effort; safe to call twice.
 */
export async function closeRequest(
  bookingId: string,
  reason: JobRequestClosedReason,
): Promise<{ closedInviteUserIds: string[]; liveQuoteUserIds: string[] }> {
  const closed = await db.query<{ user_id: string }>(
    `UPDATE job_request_invites jri
        SET status = 'expired', closed_at = NOW(), updated_at = NOW()
       FROM providers p
      WHERE jri.booking_id = $1 AND jri.status IN ('sent', 'viewed') AND p.id = jri.provider_id
      RETURNING p.user_id`,
    [bookingId],
  );
  const closedInviteUserIds = [...new Set(closed.rows.map((r) => r.user_id))];

  let liveQuoteUserIds: string[] = [];
  if (reason === 'cancelled') {
    const live = await db.query<{ user_id: string; service_name: string }>(
      `SELECT DISTINCT p.user_id, COALESCE(sub.name, sc.name, 'a service') AS service_name
         FROM booking_quotes q
         JOIN providers p ON p.id = q.provider_id
         JOIN bookings b ON b.id = q.booking_id
         LEFT JOIN service_categories sc ON sc.id = b.category_id
         LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
        WHERE q.booking_id = $1 AND q.status = 'submitted' AND q.expires_at > NOW()`,
      [bookingId],
    );
    liveQuoteUserIds = live.rows.map((r) => r.user_id);
    for (const row of live.rows) {
      try {
        await notificationService.sendPushNotification(
          row.user_id,
          'Request cancelled',
          `The customer cancelled their request for ${row.service_name}.`,
          'job_request_cancelled',
          { bookingId },
        );
      } catch (err) {
        logger.warn('Request-cancelled notice failed for provider', { bookingId, userId: row.user_id, err: String(err) });
      }
    }
  }

  for (const userId of new Set([...closedInviteUserIds, ...liveQuoteUserIds])) {
    emitToUserSafely(userId, REALTIME_EVENTS.JOB_REQUEST_CLOSED, { bookingId, reason });
  }
  return { closedInviteUserIds, liveQuoteUserIds };
}

// ────────────────────────────────────────────────────────────────────
// Provider Requests list and detail
// ────────────────────────────────────────────────────────────────────

export interface CustomerDeclineSignal {
  round: number;
  reason: string;
  /** The declined amount in centavos, only when request_show_declined_amount is on. */
  amount: number | null;
}

export interface OpenJobRequest {
  id: string;
  categoryId: string;
  categoryName: string;
  serviceName: string;
  subcategoryId: string | null;
  description: string;
  urgency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetUnknown: boolean;
  round: number;
  customerDeclines: CustomerDeclineSignal[];
  mediaCounts: JobRequestMediaCounts;
  viewedAt: string | null;
  jobPhotos: string[];
  jobVideoUrl: string | null;
  intakeAnswers: Record<string, unknown> | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  /** First name and last initial ("Ana R."); never the full surname before booking. */
  customerName: string;
  distanceKm: number | null;
  createdAt: string;
}

/**
 * D38 human audit: one answered quick question, labelled with the question
 * text the admin wrote (subcategory_intake_fields.label) instead of the
 * internal field_key. `label` is null only when the answer's key no longer
 * matches any question for that service; the app then falls back to a
 * readable version of the key.
 */
export interface IntakeQuestionAnswer {
  key: string;
  label: string | null;
  unit: string | null;
  value: string | number | boolean;
}

/** This provider's own quote, when they already responded (read-only detail). */
export interface MyQuoteSummary {
  id: string;
  status: string;
  quotedPrice: number;
  earliestDate: string | null;
  earliestTimeWindow: string | null;
}

/** Lead detail (the quote screen) also carries the labelled answers. */
export interface OpenJobRequestDetail extends OpenJobRequest {
  intakeQuestions: IntakeQuestionAnswer[];
  /** Set when this provider already quoted: the detail is then read-only. */
  myQuote: MyQuoteSummary | null;
}

interface IntakeFieldLabelRow {
  key: string;
  label: string;
  unit: string | null;
}

interface OpenJobRequestRow {
  id: string;
  category_id: string;
  category_name: string;
  service_name: string;
  subcategory_id: string | null;
  description: string;
  urgency: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_unknown: boolean;
  request_round: number;
  customer_declines: Array<{ round: number; reason: string; amount: number | string | null }> | null;
  media_counts: JobRequestMediaCounts | null;
  viewed_at: Date | null;
  job_photos: string[] | null;
  job_video_url: string | null;
  intake_answers: Record<string, unknown> | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  customer_first: string | null;
  customer_last: string | null;
  distance_km: string | number | null;
  created_at: Date;
}

function mapOpenJobRequest(row: OpenJobRequestRow): OpenJobRequest {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    serviceName: row.service_name,
    subcategoryId: row.subcategory_id,
    description: row.description,
    urgency: row.urgency,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    budgetUnknown: row.budget_unknown === true,
    round: Number(row.request_round ?? 1),
    customerDeclines: (row.customer_declines ?? []).map((d) => ({
      round: Number(d.round),
      reason: d.reason,
      amount: d.amount == null ? null : Number(d.amount),
    })),
    mediaCounts: row.media_counts
      ? { photo: Number(row.media_counts.photo), video: Number(row.media_counts.video), voice: Number(row.media_counts.voice) }
      : { photo: 0, video: 0, voice: 0 },
    viewedAt: row.viewed_at ? new Date(row.viewed_at).toISOString() : null,
    jobPhotos: row.job_photos ?? [],
    jobVideoUrl: row.job_video_url,
    intakeAnswers: row.intake_answers,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    customerName: shortCustomerName(row.customer_first, row.customer_last),
    distanceKm: row.distance_km != null ? Math.round(Number(row.distance_km) * 10) / 10 : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isAnswerValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Pair each stored answer with its question. Questions come back in the
 * admin's sort order; answers whose key matches no question follow, in the
 * order they were stored.
 */
export function labelIntakeAnswers(
  answers: Record<string, unknown> | null,
  fields: IntakeFieldLabelRow[] | null,
): IntakeQuestionAnswer[] {
  if (!answers) return [];
  const out: IntakeQuestionAnswer[] = [];
  const seen = new Set<string>();
  for (const field of fields ?? []) {
    const value = answers[field.key];
    if (!Object.prototype.hasOwnProperty.call(answers, field.key) || !isAnswerValue(value)) continue;
    out.push({ key: field.key, label: field.label, unit: field.unit ?? null, value });
    seen.add(field.key);
  }
  for (const [key, value] of Object.entries(answers)) {
    if (seen.has(key) || !isAnswerValue(value)) continue;
    out.push({ key, label: null, unit: null, value });
  }
  return out;
}

/**
 * Open requests the provider row `p` may quote on. `$2` is
 * request_max_open_quotes: a request whose live quotes reached it has been
 * taken and leaves every other provider's list. Requests this provider
 * already quoted on (any status, so a declined provider never quotes again)
 * and requests with an accepted quote are excluded.
 */
function openLeadWhere(): string {
  return `
       b.booking_type = 'quote_based'
       AND b.status IN ('requested', 'quoted')
       AND ${providerEligibleForRequestSql()}
       AND NOT EXISTS (SELECT 1 FROM booking_quotes q WHERE q.booking_id = b.id AND q.provider_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM booking_quotes q2 WHERE q2.booking_id = b.id AND q2.status = 'accepted')
       AND ${liveQuoteCountSql('b')} < $2::int`;
}

/**
 * Lead columns for `b` seen by provider `p`. `showAmountParam` is the
 * placeholder holding request_show_declined_amount. Only the barangay, city and province are
 * returned; the street address and the map pin stay hidden until booking.
 * The customer's decline note is never selected (it may hold contact details).
 */
function leadColumns(showAmountParam: string): string {
  return `b.id, b.category_id, sc.name AS category_name,
            COALESCE(sub.name, sc.name) AS service_name, b.subcategory_id,
            b.description, b.urgency, b.budget_min, b.budget_max, b.budget_unknown, b.request_round,
            b.job_photos, b.job_video_url, b.intake_answers, b.barangay, b.city, b.province,
            u.first_name AS customer_first, u.last_name AS customer_last,
            CASE WHEN b.latitude IS NOT NULL AND b.longitude IS NOT NULL
                  AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
                 THEN ${requestDistanceKmSql()} ELSE NULL END AS distance_km,
            b.created_at,
            (SELECT MAX(i.viewed_at) FROM job_request_invites i
              WHERE i.booking_id = b.id AND i.provider_id = p.id AND i.round = b.request_round) AS viewed_at,
            (SELECT COALESCE(json_agg(json_build_object(
                      'round', d.round,
                      'reason', d.decline_reason,
                      'amount', CASE WHEN ${showAmountParam}::boolean THEN d.quoted_price ELSE NULL END)
                    ORDER BY d.declined_at), '[]'::json)
               FROM booking_quotes d
              WHERE d.booking_id = b.id AND d.declined_at IS NOT NULL) AS customer_declines,
            (SELECT json_build_object(
                      'photo', COUNT(*) FILTER (WHERE m.kind = 'photo'),
                      'video', COUNT(*) FILTER (WHERE m.kind = 'video'),
                      'voice', COUNT(*) FILTER (WHERE m.kind = 'voice'))
               FROM job_media m
              WHERE m.booking_id = b.id AND m.status = 'attached' AND m.purpose = 'job_request') AS media_counts`;
}

const LEAD_JOINS = `
       JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
       JOIN users u ON u.id = b.customer_id`;

/**
 * Open quote requests a provider can quote: quote_based requests in one of
 * their active categories, inside their service radius, that they have not
 * quoted, that have no accepted quote and whose live quotes are under
 * request_max_open_quotes.
 */
export async function getOpenJobRequestsForProvider(
  providerUserId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ requests: OpenJobRequest[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const prov = await db.query<{ id: string }>(`SELECT id FROM providers WHERE user_id = $1`, [providerUserId]);
  const providerId = prov.rows[0]?.id;
  if (!providerId) throw createAppError('Provider profile not found.', 404);
  const policy = await settingsService.getRequestPolicy();

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM bookings b JOIN providers p ON p.id = $1
      WHERE ${openLeadWhere()}`,
    [providerId, policy.maxOpenQuotes],
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const rows = await db.query<OpenJobRequestRow>(
    `SELECT ${leadColumns('$3')}
       FROM bookings b
       JOIN providers p ON p.id = $1
       ${LEAD_JOINS}
      WHERE ${openLeadWhere()}
      ORDER BY b.created_at DESC
      LIMIT $4 OFFSET $5`,
    [providerId, policy.maxOpenQuotes, policy.showDeclinedAmount, pageSize, offset],
  );

  return { requests: rows.rows.map(mapOpenJobRequest), total, page, pageSize };
}

type DetailRow = OpenJobRequestRow & { intake_fields: IntakeFieldLabelRow[] | null };

const INTAKE_FIELDS_COLUMN = `(SELECT json_agg(json_build_object('key', f.field_key, 'label', f.label, 'unit', f.unit)
                             ORDER BY f.sort_order, f.field_key)
               FROM subcategory_intake_fields f
              WHERE f.subcategory_id = b.subcategory_id) AS intake_fields`;

function toDetail(row: DetailRow, myQuote: MyQuoteSummary | null): OpenJobRequestDetail {
  return {
    ...mapOpenJobRequest(row),
    // D38: the quote screen shows each answer under the admin-written
    // question. Inactive questions are included on purpose: an answer given
    // before a question was switched off still deserves its real label.
    intakeQuestions: labelIntakeAnswers(row.intake_answers, row.intake_fields ?? null),
    myQuote,
  };
}

/**
 * The request detail behind the provider quote screen. Side-effect free (the
 * route marks the invite viewed), so job media access can call it safely.
 *
 *   - An open request this provider may quote: the detail, myQuote null.
 *   - A request this provider already quoted on (any quote status): the same
 *     area-only detail, read-only, with myQuote (critique M6).
 *   - Otherwise, for a provider who was invited or opened it before: 409
 *     REQUEST_TAKEN when another provider holds or won it, 410 REQUEST_CLOSED
 *     when it was cancelled or expired. Everyone else gets 404
 *     REQUEST_NOT_FOUND, so the response never reveals a request outside the
 *     provider's services or radius.
 */
export async function getOpenJobRequestForProvider(
  providerUserId: string,
  bookingId: string,
): Promise<OpenJobRequestDetail> {
  const providerResult = await db.query<{ id: string }>(
    `SELECT id FROM providers WHERE user_id = $1 AND status = 'approved'`,
    [providerUserId],
  );
  const providerId = providerResult.rows[0]?.id;
  if (!providerId) throw createAppError('Provider profile not found.', 404);
  const policy = await settingsService.getRequestPolicy();

  const open = await db.query<DetailRow>(
    `SELECT ${leadColumns('$3')}, ${INTAKE_FIELDS_COLUMN}
       FROM bookings b
       JOIN providers p ON p.id = $1
       ${LEAD_JOINS}
      WHERE ${openLeadWhere()}
        AND b.id = $4
      LIMIT 1`,
    [providerId, policy.maxOpenQuotes, policy.showDeclinedAmount, bookingId],
  );
  if (open.rows[0]) return toDetail(open.rows[0], null);

  const mine = await db.query<{
    id: string; status: string; quoted_price: number; earliest_date: string | null; earliest_time_window: string | null;
  }>(
    `SELECT q.id, q.status, q.quoted_price, to_char(q.earliest_date, 'YYYY-MM-DD') AS earliest_date,
            q.earliest_time_window
       FROM booking_quotes q
       JOIN bookings b ON b.id = q.booking_id AND b.booking_type = 'quote_based'
      WHERE q.booking_id = $1 AND q.provider_id = $2
      ORDER BY q.created_at DESC
      LIMIT 1`,
    [bookingId, providerId],
  );
  const myQuoteRow = mine.rows[0];
  if (myQuoteRow) {
    const readOnly = await db.query<DetailRow>(
      `SELECT ${leadColumns('$2')}, ${INTAKE_FIELDS_COLUMN}
         FROM bookings b
         JOIN providers p ON p.id = $1
         ${LEAD_JOINS}
        WHERE b.id = $3
        LIMIT 1`,
      [providerId, policy.showDeclinedAmount, bookingId],
    );
    if (readOnly.rows[0]) {
      return toDetail(readOnly.rows[0], {
        id: myQuoteRow.id,
        status: myQuoteRow.status,
        quotedPrice: Number(myQuoteRow.quoted_price),
        earliestDate: myQuoteRow.earliest_date,
        earliestTimeWindow: myQuoteRow.earliest_time_window,
      });
    }
  }

  throw await classifyMissingRequest(providerId, bookingId, policy.maxOpenQuotes);
}

/**
 * Why an invited provider cannot open a request (merged plan conflict 14):
 * the 409/410 split applies only to a provider with an invite row.
 */
export async function classifyMissingRequest(
  providerId: string,
  bookingId: string,
  maxOpenQuotes: number,
): Promise<AppError> {
  const result = await db.query<{ status: string; live: number }>(
    `SELECT b.status, ${liveQuoteCountSql('b')} AS live
       FROM bookings b
      WHERE b.id = $1 AND b.booking_type = 'quote_based'
        AND EXISTS (SELECT 1 FROM job_request_invites i WHERE i.booking_id = b.id AND i.provider_id = $2)`,
    [bookingId, providerId],
  );
  const row = result.rows[0];
  const notFound = appError('This request is no longer available.', 404, 'REQUEST_NOT_FOUND');
  if (!row) return notFound;
  if (['cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'].includes(row.status)) {
    return appError('This request has been closed.', 410, 'REQUEST_CLOSED');
  }
  if (!['requested', 'quoted'].includes(row.status) || Number(row.live) >= maxOpenQuotes) {
    return appError('Another pro is already handling this request.', 409, 'REQUEST_TAKEN');
  }
  return notFound;
}

/**
 * Record that the provider opened the request detail in its current round:
 * a pushed invite becomes 'viewed', and a provider who found the request in
 * their list gets an 'inbox' invite. A quoted or closed invite keeps its
 * status; viewed_at keeps its first value.
 */
export async function markRequestViewed(providerUserId: string, bookingId: string): Promise<void> {
  await db.query(
    `INSERT INTO job_request_invites (booking_id, provider_id, round, source, status, viewed_at)
     SELECT b.id, p.id, b.request_round, 'inbox', 'viewed', NOW()
       FROM bookings b
       JOIN providers p ON p.user_id = $2
      WHERE b.id = $1 AND b.booking_type = 'quote_based'
     ON CONFLICT (booking_id, provider_id, round) DO UPDATE
       SET viewed_at = COALESCE(job_request_invites.viewed_at, EXCLUDED.viewed_at),
           status = CASE WHEN job_request_invites.status = 'sent' THEN 'viewed' ELSE job_request_invites.status END,
           updated_at = NOW()`,
    [bookingId, providerUserId],
  );
}

export interface ProviderRequestSummary {
  /** Open requests in the provider's list. */
  openCount: number;
  /** Of those, the ones not opened yet in their current round. */
  unseenCount: number;
  /** The provider's live quotes still waiting on a customer. */
  quotesWaitingCount: number;
  /** The provider's online switch (new requests are pushed only while on). */
  isAvailable: boolean;
}

export async function getRequestSummary(providerUserId: string): Promise<ProviderRequestSummary> {
  const prov = await db.query<{ id: string }>(`SELECT id FROM providers WHERE user_id = $1`, [providerUserId]);
  const providerId = prov.rows[0]?.id;
  if (!providerId) throw createAppError('Provider profile not found.', 404);
  const policy = await settingsService.getRequestPolicy();
  const result = await db.query<{
    open_count: number; unseen_count: number; quotes_waiting_count: number; is_available: boolean;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM bookings b WHERE ${openLeadWhere()}) AS open_count,
       (SELECT COUNT(*)::int FROM bookings b
         WHERE ${openLeadWhere()}
           AND NOT EXISTS (SELECT 1 FROM job_request_invites i
                            WHERE i.booking_id = b.id AND i.provider_id = p.id
                              AND i.round = b.request_round AND i.viewed_at IS NOT NULL)) AS unseen_count,
       (SELECT COUNT(*)::int FROM booking_quotes q JOIN bookings qb ON qb.id = q.booking_id
         WHERE q.provider_id = p.id AND q.status = 'submitted' AND q.expires_at > NOW()
           AND qb.status IN ('requested', 'quoted')) AS quotes_waiting_count,
       p.is_available
     FROM providers p
    WHERE p.id = $1`,
    [providerId, policy.maxOpenQuotes],
  );
  const row = result.rows[0]!;
  return {
    openCount: Number(row.open_count),
    unseenCount: Number(row.unseen_count),
    quotesWaitingCount: Number(row.quotes_waiting_count),
    isAvailable: row.is_available === true,
  };
}

// ────────────────────────────────────────────────────────────────────
// My quotes
// ────────────────────────────────────────────────────────────────────

export const MY_QUOTE_DISPLAY_STATUSES = [
  'waiting', 'accepted', 'booked', 'declined', 'not_selected', 'expired', 'withdrawn', 'request_closed',
] as const;
export type MyQuoteDisplayStatus = typeof MY_QUOTE_DISPLAY_STATUSES[number];

/** The filter tabs of My quotes and the display statuses each one shows. */
export const MY_QUOTE_FILTERS: Readonly<Record<string, readonly MyQuoteDisplayStatus[] | null>> = {
  all: null,
  waiting: ['waiting'],
  accepted: ['accepted', 'booked'],
  declined: ['declined', 'not_selected'],
  expired: ['expired', 'withdrawn', 'request_closed'],
};

/**
 * How a provider's quote reads to them. A customer decline carries
 * declined_at; a sibling closed by acceptQuote does not (not_selected).
 */
const MY_QUOTE_DISPLAY_SQL = `(CASE
    WHEN q.status = 'withdrawn' THEN 'withdrawn'
    WHEN q.status = 'declined' AND q.declined_at IS NOT NULL THEN 'declined'
    WHEN q.status = 'declined' THEN 'not_selected'
    WHEN b.status IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin') THEN 'request_closed'
    WHEN q.status = 'accepted' AND b.status = 'payment_pending' THEN 'accepted'
    WHEN q.status = 'accepted' AND b.provider_id = q.provider_id THEN 'booked'
    WHEN q.status = 'accepted' THEN 'request_closed'
    WHEN q.status = 'submitted' AND q.expires_at > NOW() AND b.status IN ('requested', 'quoted') THEN 'waiting'
    WHEN b.status IN ('requested', 'quoted') THEN 'expired'
    ELSE 'request_closed'
  END)`;

export interface MyQuote {
  quoteId: string;
  bookingId: string;
  serviceName: string;
  barangay: string | null;
  city: string | null;
  quotedPrice: number;
  displayStatus: MyQuoteDisplayStatus;
  /** The customer's decline reason (declined quotes only); the note is never shown. */
  declineReason: string | null;
  earliestDate: string | null;
  earliestTimeWindow: string | null;
  createdAt: string;
  expiresAt: string;
}

export async function getMyQuotes(
  providerUserId: string,
  opts: { status?: string; page?: number; pageSize?: number } = {},
): Promise<{ quotes: MyQuote[]; total: number; page: number; pageSize: number }> {
  const filterKey = opts.status ?? 'all';
  if (!Object.prototype.hasOwnProperty.call(MY_QUOTE_FILTERS, filterKey)) {
    throw createAppError('status must be one of waiting, accepted, declined, expired or all.', 400);
  }
  const statuses = MY_QUOTE_FILTERS[filterKey] ?? null;
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const prov = await db.query<{ id: string }>(`SELECT id FROM providers WHERE user_id = $1`, [providerUserId]);
  const providerId = prov.rows[0]?.id;
  if (!providerId) throw createAppError('Provider profile not found.', 404);

  const base = `FROM booking_quotes q
       JOIN bookings b ON b.id = q.booking_id
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
      WHERE q.provider_id = $1
        AND ($2::text[] IS NULL OR ${MY_QUOTE_DISPLAY_SQL} = ANY($2::text[]))`;
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count ${base}`,
    [providerId, statuses],
  );
  const rows = await db.query<{
    id: string; booking_id: string; service_name: string; barangay: string | null; city: string | null;
    quoted_price: number; display_status: MyQuoteDisplayStatus; decline_reason: string | null;
    earliest_date: string | null; earliest_time_window: string | null; created_at: Date; expires_at: Date;
  }>(
    `SELECT q.id, q.booking_id, COALESCE(sub.name, sc.name, 'Service') AS service_name, b.barangay, b.city,
            q.quoted_price, ${MY_QUOTE_DISPLAY_SQL} AS display_status,
            CASE WHEN q.declined_at IS NOT NULL THEN q.decline_reason ELSE NULL END AS decline_reason,
            to_char(q.earliest_date, 'YYYY-MM-DD') AS earliest_date, q.earliest_time_window,
            q.created_at, q.expires_at
       ${base}
      ORDER BY q.created_at DESC, q.id
      LIMIT $3 OFFSET $4`,
    [providerId, statuses, pageSize, offset],
  );
  return {
    quotes: rows.rows.map((r) => ({
      quoteId: r.id,
      bookingId: r.booking_id,
      serviceName: r.service_name,
      barangay: r.barangay,
      city: r.city,
      quotedPrice: Number(r.quoted_price),
      displayStatus: r.display_status,
      declineReason: r.decline_reason,
      earliestDate: r.earliest_date,
      earliestTimeWindow: r.earliest_time_window,
      createdAt: new Date(r.created_at).toISOString(),
      expiresAt: new Date(r.expires_at).toISOString(),
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

// ────────────────────────────────────────────────────────────────────
// Worker queries (jobs/workers.ts, the 5-minute 'all' job)
// ────────────────────────────────────────────────────────────────────

/*
 * Both worker sweeps below act only on rounds the D38 engine opened itself:
 * request_round_opened_at is stamped by createJobRequest at creation and by
 * every reopen. Migration 183 adds the column with no backfill, so a request
 * posted before the engine went live has it NULL and no invite records, and
 * the old D27 fan-out already pushed it. Without this rule the first deploy
 * would push every such open request to providers again, tell its customer
 * "still looking", and flag the ones nobody is eligible for any more (a
 * flagged request is exempt from the 72-hour expiry, so it would never close).
 * A legacy row reopened by reconcileRequestAfterQuoteLapse gets a backdated
 * round clock and is excluded separately (see each query).
 */

/**
 * Claim the requests that should get the one "still looking" notice: open,
 * no live quote, waiting at least `minutes` since the round opened, and never
 * told before. The UPDATE ... RETURNING claim means a request is sent the
 * notice exactly once, however many workers run. Requests older than the
 * unmatched-expiry window are left alone, and so are requests posted before
 * the engine went live (no round clock). A legacy row's silent reopen marks
 * the notice as handled, so it is never claimed here.
 */
export async function claimStillLookingRequests(
  minutes: number,
  expiryHours: number,
): Promise<Array<{ id: string; customer_id: string }>> {
  const result = await db.query<{ id: string; customer_id: string }>(
    `UPDATE bookings b
        SET request_still_looking_notified_at = NOW()
      WHERE b.booking_type = 'quote_based'
        AND b.status = 'requested'
        AND b.request_still_looking_notified_at IS NULL
        AND b.request_round_opened_at IS NOT NULL
        AND b.request_round_opened_at <= NOW() - make_interval(mins => $1::int)
        AND b.request_round_opened_at > NOW() - make_interval(hours => $2::int)
        AND ${liveQuoteCountSql('b')} = 0
      RETURNING b.id, b.customer_id`,
    [minutes, expiryHours],
  );
  return result.rows;
}

/** How long after a round opens the re-fan-out sweep keeps retrying it. */
const REFANOUT_WINDOW_MINUTES = 60;

/**
 * Critique M5: the fan-out after a request is posted or reopened runs after
 * the commit and could be lost to a crash or restart. These are open
 * requests, not flagged for the back office, whose current round has no
 * pushed invite and opened between 2 and 60 minutes ago (and inside the
 * expiry window). The worker re-runs the same guarded, idempotent fan-out
 * for each.
 *
 *   - Only 'push' invites count: a provider who opened the request from their
 *     Requests list ('inbox' invite) does not mean the round was sent out.
 *   - The 60-minute window: a lost fan-out shows up within one or two runs of
 *     the 5-minute job. A round whose fan-out ran and found nobody leaves no
 *     invite either and looks the same, so it is retried only during that
 *     first hour instead of every 5 minutes until the 72-hour expiry (those
 *     rows would otherwise fill the batch ahead of newer lost rounds).
 *     Providers who come online later still see the request in their list.
 *   - A legacy row reopened silently has its round clock backdated to its
 *     lapse, more than an hour before the reconcile ran (the critique's
 *     legacy rule), so the window also keeps it out: legacy rows get no
 *     fan-out.
 *   - Requests posted before the engine went live (no round clock) are left
 *     alone (see above).
 */
export async function findRoundsNeedingFanOut(
  expiryHours: number,
  limit = 50,
): Promise<Array<{
  id: string; request_round: number; decline_reason: string | null; declined_amount: number | null;
}>> {
  const result = await db.query<{
    id: string; request_round: number; decline_reason: string | null; declined_amount: number | null;
  }>(
    `SELECT b.id, b.request_round, last_decline.decline_reason, last_decline.quoted_price AS declined_amount
       FROM bookings b
       LEFT JOIN LATERAL (
         SELECT d.decline_reason, d.quoted_price
           FROM booking_quotes d
          WHERE d.booking_id = b.id AND d.declined_at IS NOT NULL AND d.round = b.request_round - 1
          ORDER BY d.declined_at DESC
          LIMIT 1
       ) last_decline ON TRUE
      WHERE b.booking_type = 'quote_based'
        AND b.status = 'requested'
        AND b.request_ops_review_at IS NULL
        AND b.request_round_opened_at IS NOT NULL
        AND b.request_round_opened_at < NOW() - INTERVAL '2 minutes'
        AND b.request_round_opened_at > NOW() - make_interval(mins => $3::int)
        AND b.request_round_opened_at > NOW() - make_interval(hours => $1::int)
        AND NOT EXISTS (SELECT 1 FROM job_request_invites i
                         WHERE i.booking_id = b.id AND i.round = b.request_round AND i.source = 'push')
      ORDER BY b.request_round_opened_at
      LIMIT $2`,
    [expiryHours, limit, REFANOUT_WINDOW_MINUTES],
  );
  return result.rows.map((r) => ({
    ...r,
    request_round: Number(r.request_round),
    declined_amount: r.declined_amount == null ? null : Number(r.declined_amount),
  }));
}
