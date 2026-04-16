import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

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

interface CountRow { count: string }

interface BookingContextRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  status: string;
}

const IMMUTABLE_AFTER_DAYS = 7;
const MAX_REVIEW_PHOTOS = 5;

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
    imageUrls?: string[];
  },
): Promise<ReviewRow> {
  const booking = await db.query<BookingContextRow>(
    `SELECT id, customer_id, provider_id, status FROM bookings WHERE id = $1`,
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

  const existing = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM reviews WHERE booking_id = $1`,
    [bookingId],
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    throw createAppError('A review already exists for this booking.', 409);
  }

  const flagged = containsFlaggedContent(data.comment ?? '');

  return db.transaction(async (client) => {
    const result = await client.query<ReviewRow>(
      `INSERT INTO reviews
        (booking_id, reviewer_id, provider_id, rating, quality_rating, punctuality_rating,
         professionalism_rating, communication_rating, value_rating, comment, is_visible, is_flagged)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        bookingId, reviewerId, bk.provider_id,
        data.rating,
        data.qualityRating ?? null,
        data.punctualityRating ?? null,
        data.professionalismRating ?? null,
        data.communicationRating ?? null,
        data.valueRating ?? null,
        data.comment ?? '',
        !flagged,
        flagged,
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
      `SELECT COUNT(*)::text as count FROM reviews WHERE provider_id = $1 AND is_visible = TRUE`,
      [providerId],
    ),
    db.query<ReviewRow>(
      `SELECT * FROM reviews WHERE provider_id = $1 AND is_visible = TRUE
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
     WHERE provider_id = $1 AND is_visible = TRUE`,
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
     FROM reviews WHERE provider_id = $1 AND is_visible = TRUE`,
    [providerId],
  );

  const avgRating = Number(result.rows[0]?.avg_rating ?? 0);

  await client.query(
    `UPDATE providers SET rating = $1 WHERE id = $2`,
    [avgRating, providerId],
  );
}

function containsFlaggedContent(text: string): boolean {
  if (!text) return false;
  const phonePattern = /(\+?63|0)\d{10}/;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  return phonePattern.test(text) || emailPattern.test(text);
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
    providerResponse: r.provider_response,
    providerResponseAt: r.provider_response_at,
    isVisible: r.is_visible,
    isFlagged: r.is_flagged,
    images: (images ?? []).map((i) => ({ id: i.id, imageUrl: i.image_url })),
    createdAt: r.created_at,
  };
}
