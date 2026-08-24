import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';

interface ReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  provider_id: string;
  rating: number;
  quality_rating: number | null;
  punctuality_rating: number | null;
  professionalism_rating: number | null;
  communication_rating: number | null;
  value_rating: number | null;
  comment: string;
  tags: string[];
  private_note: string | null;
  provider_response: string | null;
  provider_response_at: Date | null;
  is_visible: boolean;
  is_flagged: boolean;
  admin_response: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ReviewImageRow {
  id: string;
  review_id: string;
  image_url: string;
  created_at: Date;
}

interface AggregatedRating {
  overall: number;
  quality: number | null;
  punctuality: number | null;
  professionalism: number | null;
  communication: number | null;
  value: number | null;
  totalReviews: number;
}

function demoReviewExclusion(alias = ''): string {
  return process.env.ENABLE_TEST_FIXTURES === '1'
    ? ''
    : ` AND ${alias}comment NOT LIKE '[demo]%'`;
}

interface CountRow { count: string }

interface BookingContextRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  status: string;
  // D23 — which team member performed the job (NULL = the provider owner). The
  // review is attributed to them so per-member quality can be broken out while
  // the provider's headline rating still aggregates all of provider_id's reviews.
  performer_staff_id: string | null;
}

const IMMUTABLE_AFTER_DAYS = 7;
const MAX_REVIEW_PHOTOS = 5;
// MED-N131 fix — defense-in-depth max length on review.comment and
// privateNote. The Zod validator on the route already caps at 1000,
// but services should never trust their input. This second layer
// prevents a 1MB comment from any non-route caller (admin tools,
// background workers, future test fixtures).
const MAX_REVIEW_COMMENT_CHARS = 1000;
const MAX_PRIVATE_NOTE_CHARS = 1000;

export async function createReview(
  bookingId: string,
  reviewerId: string,
  data: {
    rating: number;
    qualityRating?: number;
    punctualityRating?: number;
    professionalismRating?: number;
    communicationRating?: number;
    valueRating?: number;
    comment?: string;
    tags?: string[];
    privateNote?: string;
    imageUrls?: string[];
  },
): Promise<ReviewRow> {
  const booking = await db.query<BookingContextRow>(
    `SELECT id, customer_id, provider_id, status, performer_staff_id FROM bookings WHERE id = $1`,
    [bookingId],
  );
  if (booking.rows.length === 0) throw createAppError('Booking not found.', 404);
  const bk = booking.rows[0]!;

  if (bk.customer_id !== reviewerId) {
    throw createAppError('Only the booking customer can leave a review.', 403);
  }

  if (!bk.provider_id) {
    throw createAppError('Cannot review a booking with no provider.', 409);
  }

  if (!['confirmed', 'payout_ready', 'paid_out'].includes(bk.status)) {
    throw createAppError('Can only review after job is confirmed.', 409);
  }

  // MED-N131 — defense-in-depth length caps. Even if a caller bypassed
  // the route validator, the service rejects oversized input.
  if (data.comment && data.comment.length > MAX_REVIEW_COMMENT_CHARS) {
    throw createAppError(`Review comment must be ${MAX_REVIEW_COMMENT_CHARS} characters or less.`, 400);
  }
  if (data.privateNote && data.privateNote.length > MAX_PRIVATE_NOTE_CHARS) {
    throw createAppError(`Private note must be ${MAX_PRIVATE_NOTE_CHARS} characters or less.`, 400);
  }

  const existing = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM reviews WHERE booking_id = $1`,
    [bookingId],
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    throw createAppError('A review already exists for this booking.', 409);
  }

  const flagged = containsFlaggedContent(data.comment ?? '');

  // Validate allowed tags
  const ALLOWED_TAGS = new Set([
    'professional', 'punctual', 'great_value', 'friendly', 'clean', 'thorough',
    'responsive', 'skilled', 'reliable', 'careful',
  ]);
  const sanitizedTags = (data.tags ?? []).filter((t) => ALLOWED_TAGS.has(t));

  return db.transaction(async (client) => {
    const result = await client.query<ReviewRow>(
      `INSERT INTO reviews
        (booking_id, reviewer_id, provider_id, rating, quality_rating, punctuality_rating,
         professionalism_rating, communication_rating, value_rating, comment, tags, private_note, is_visible, is_flagged, performer_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        bookingId, reviewerId, bk.provider_id,
        data.rating,
        data.qualityRating ?? null,
        data.punctualityRating ?? null,
        data.professionalismRating ?? null,
        data.communicationRating ?? null,
        data.valueRating ?? null,
        data.comment ?? '',
        sanitizedTags,
        data.privateNote?.trim() ?? null,
        !flagged,
        flagged,
        // D23 — attribute the review to whoever performed the job.
        bk.performer_staff_id,
      ],
    );

    const review = result.rows[0]!;

    if (data.imageUrls && data.imageUrls.length > 0) {
      const urls = data.imageUrls.slice(0, MAX_REVIEW_PHOTOS);
      for (const url of urls) {
        await client.query(
          `INSERT INTO review_images (review_id, image_url) VALUES ($1, $2)`,
          [review.id, url],
        );
      }
    }

    await updateProviderAggregateRating(client, bk.provider_id!);

    logger.info('Review created', { reviewId: review.id, bookingId, rating: data.rating, flagged });
    return review;
  }).then(async (review) => {
    // BUG-PHASE125-01 fix — pre-fix createReview never notified the
    // provider when a customer left a review. The notification.service
    // already declared `rating_received` in its type union (line 49)
    // but no service actually emitted it. Provider learned about new
    // reviews only by manually opening the Reviews screen — and since
    // mobile/app/provider/notifications.tsx tries to route taps on
    // `rating_received` notifications to /provider/reviews, that
    // routing was dead too.
    //
    // Now: emit `rating_received` after the review row commits. Best-
    // effort — a notification failure must not roll back the review
    // (the .then() is OUTSIDE the transaction). The provider's user_id
    // is looked up from providers.user_id keyed on bk.provider_id.
    try {
      const providerUser = await db.query<{ user_id: string }>(
        `SELECT user_id FROM providers WHERE id = $1`,
        [bk.provider_id!],
      );
      const providerUserId = providerUser.rows[0]?.user_id;
      if (providerUserId) {
        const stars = '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating);
        await notificationService.createPushNotification({
          userId: providerUserId,
          type: 'rating_received',
          title: `New ${data.rating}-star review`,
          body: data.comment && data.comment.trim().length > 0
            ? `${stars}: "${data.comment.slice(0, 120)}${data.comment.length > 120 ? '…' : ''}"`
            : `${stars} — Tap to read in your Reviews tab.`,
          data: { reviewId: review.id, bookingId, rating: data.rating },
        });

        // Provider-facing quality-standing nudge on a low rating: constructive,
        // not punitive — points the provider at the in-app standards/tips so
        // they can improve. Complements the admin Quality Watch alerts.
        if (data.rating <= 2) {
          await notificationService.createPushNotification({
            userId: providerUserId,
            type: 'quality_standing',
            title: 'A customer rated this job low',
            body: 'Every job counts toward your standing on onService. Tap to see our quality standards and tips to bounce back.',
            data: { reviewId: review.id, bookingId, rating: data.rating, route: '/provider/standards' },
          });
        }
      }
    } catch (notifyErr) {
      logger.error('rating_received notification failed (non-fatal)', {
        reviewId: review.id, bookingId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }
    return review;
  });
}

export async function addProviderResponse(
  reviewId: string,
  providerId: string,
  responseText: string,
): Promise<ReviewRow> {
  const review = await db.query<ReviewRow>(
    `SELECT * FROM reviews WHERE id = $1`,
    [reviewId],
  );
  if (review.rows.length === 0) throw createAppError('Review not found.', 404);
  const r = review.rows[0]!;

  if (r.provider_id !== providerId) {
    throw createAppError('You can only respond to reviews for your services.', 403);
  }

  if (r.provider_response) {
    throw createAppError('You have already responded to this review.', 409);
  }

  const daysSinceReview = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceReview > IMMUTABLE_AFTER_DAYS) {
    throw createAppError(`Cannot respond to reviews older than ${IMMUTABLE_AFTER_DAYS} days.`, 409);
  }

  const result = await db.query<ReviewRow>(
    `UPDATE reviews SET provider_response = $1, provider_response_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [responseText, reviewId],
  );

  logger.info('Provider response added', { reviewId, providerId });
  return result.rows[0]!;
}

export async function getReviewsByProvider(
  providerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ reviews: ReviewRow[]; total: number; aggregate: AggregatedRating }> {
  const offset = (page - 1) * pageSize;

  const [countRes, dataRes, aggRes] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM reviews WHERE provider_id = $1 AND is_visible = TRUE${demoReviewExclusion()}`,
      [providerId],
    ),
    db.query<ReviewRow>(
      `SELECT * FROM reviews WHERE provider_id = $1 AND is_visible = TRUE${demoReviewExclusion()}
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [providerId, pageSize, offset],
    ),
    getProviderAggregateRating(providerId),
  ]);

  return {
    reviews: dataRes.rows,
    total: Number(countRes.rows[0]?.count ?? 0),
    aggregate: aggRes,
  };
}

export async function getReviewByBooking(bookingId: string): Promise<ReviewRow | null> {
  const result = await db.query<ReviewRow>(
    `SELECT * FROM reviews WHERE booking_id = $1`,
    [bookingId],
  );
  return result.rows[0] ?? null;
}

export async function getReviewImages(reviewId: string): Promise<ReviewImageRow[]> {
  const result = await db.query<ReviewImageRow>(
    `SELECT * FROM review_images WHERE review_id = $1 ORDER BY created_at ASC`,
    [reviewId],
  );
  return result.rows;
}

export async function getProviderAggregateRating(providerId: string): Promise<AggregatedRating> {
  interface AggRow {
    overall: string;
    quality: string | null;
    punctuality: string | null;
    professionalism: string | null;
    communication: string | null;
    value: string | null;
    total_reviews: string;
  }

  const result = await db.query<AggRow>(
    `SELECT
       COALESCE(AVG(rating), 0) as overall,
       AVG(quality_rating) as quality,
       AVG(punctuality_rating) as punctuality,
       AVG(professionalism_rating) as professionalism,
       AVG(communication_rating) as communication,
       AVG(value_rating) as value,
       COUNT(*)::text as total_reviews
     FROM reviews
     WHERE provider_id = $1 AND is_visible = TRUE${demoReviewExclusion()}`,
    [providerId],
  );

  const r = result.rows[0]!;
  return {
    overall: Math.round(Number(r.overall) * 10) / 10,
    quality: r.quality ? Math.round(Number(r.quality) * 10) / 10 : null,
    punctuality: r.punctuality ? Math.round(Number(r.punctuality) * 10) / 10 : null,
    professionalism: r.professionalism ? Math.round(Number(r.professionalism) * 10) / 10 : null,
    communication: r.communication ? Math.round(Number(r.communication) * 10) / 10 : null,
    value: r.value ? Math.round(Number(r.value) * 10) / 10 : null,
    totalReviews: Number(r.total_reviews),
  };
}

async function updateProviderAggregateRating(
  client: { query: <R extends import('pg').QueryResultRow>(text: string, params?: unknown[]) => Promise<import('pg').QueryResult<R>> },
  providerId: string,
): Promise<void> {
  interface AvgRow { avg_rating: string }
  const result = await client.query<AvgRow>(
    `SELECT COALESCE(AVG(rating), 0)::numeric(3,2) as avg_rating
     FROM reviews WHERE provider_id = $1 AND is_visible = TRUE${demoReviewExclusion()}`,
    [providerId],
  );

  const avgRating = Number(result.rows[0]?.avg_rating ?? 0);

  await client.query(
    `UPDATE providers SET rating = $1 WHERE id = $2`,
    [avgRating, providerId],
  );
}

// MED-N130 fix — flagged-content detection used to only catch phone
// numbers and emails (the original concern was customers/providers
// trying to take the conversation off-platform). It missed three
// classes of abuse:
//   1. URLs / external links (off-platform contact attempts).
//   2. Profanity / harassment / threats (review-quality abuse).
//   3. PH-format mobile numbers without the +63/0 prefix (bare
//      9XX-XXX-XXXX).
//
// Post-fix: we run a layered check. The list is tunable via a single
// const so admin can grow it without touching call sites. Matching is
// case-insensitive. We split on word boundaries / punctuation so an
// in-context word like "passable" doesn't match the seed "ass".
function containsFlaggedContent(text: string): boolean {
  if (!text) return false;
  const lowered = text.toLowerCase();

  // --- Phone numbers ---
  const phonePattern = /(\+?63|0)\d{10}/;
  // Bare PH mobile (without +63/0 prefix). 9XX followed by 7 digits,
  // optionally with spaces or dashes between groups.
  const bareMobilePattern = /\b9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/;
  // International formats (e.g., +1, +44, +65 etc.).
  const intlPattern = /\+\d{1,3}[\s-]?\d{6,}/;

  // --- Email ---
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  // --- URLs / off-platform links ---
  const urlPattern = /\b(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|ph|io|me|app|co|tk|ml|ga|cf|xyz|info|biz))\b/i;

  // --- Profanity / harassment / threats (English + Tagalog/Filipino common terms) ---
  const profanityList = [
    'fuck', 'shit', 'cunt', 'bitch', 'asshole', 'dickhead', 'motherfucker',
    'tangina', 'putang', 'gago', 'puta', 'ulol', 'tanga',
    'kupal', 'pakyu', 'pakshet', 'leche',
  ];
  const profanityRegex = new RegExp(`\\b(${profanityList.join('|')})\\b`, 'i');

  const threatList = [
    'kill you', 'kill u', 'i will kill', 'papatayin kita', 'papatayin ka',
    'i hope you die', 'rape', 'i will hurt', 'destroy you',
  ];
  const threatRegex = new RegExp(`(${threatList.join('|')})`, 'i');

  return phonePattern.test(text)
    || bareMobilePattern.test(text)
    || intlPattern.test(text)
    || emailPattern.test(text)
    || urlPattern.test(text)
    || profanityRegex.test(lowered)
    || threatRegex.test(lowered);
}

export function formatReview(r: ReviewRow, images?: ReviewImageRow[]): Record<string, unknown> {
  return {
    id: r.id,
    bookingId: r.booking_id,
    reviewerId: r.reviewer_id,
    providerId: r.provider_id,
    rating: r.rating,
    qualityRating: r.quality_rating,
    punctualityRating: r.punctuality_rating,
    professionalismRating: r.professionalism_rating,
    communicationRating: r.communication_rating,
    valueRating: r.value_rating,
    comment: r.comment,
    tags: r.tags ?? [],
    // private_note is intentionally omitted — never expose to clients
    providerResponse: r.provider_response,
    providerResponseAt: r.provider_response_at,
    isVisible: r.is_visible,
    isFlagged: r.is_flagged,
    images: (images ?? []).map((i) => ({ id: i.id, imageUrl: i.image_url })),
    createdAt: r.created_at,
  };
}
