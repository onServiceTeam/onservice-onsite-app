import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// --- Interfaces ---

interface RebookingSuggestion {
  providerId: string;
  providerName: string;
  businessName: string;
  averageRating: string;
  totalReviews: number;
  totalJobsCompleted: number;
  tier: string;
  basePrice: number | null;
  distanceKm: number | null;
  previouslyBooked: boolean;
}

interface BookingHistoryRow {
  provider_id: string;
  provider_name: string;
  business_name: string;
  rating: string;
  total_reviews: number;
  total_jobs: number;
  tier: string;
  base_price: number | null;
  booking_count: string;
}

interface AvailableProviderRow {
  provider_id: string;
  provider_name: string;
  business_name: string;
  rating: string;
  total_reviews: number;
  total_jobs: number;
  tier: string;
  base_price: number | null;
  latitude: string | null;
  longitude: string | null;
}

// --- Smart Rebooking ---

export async function getRebookingSuggestions(
  customerId: string,
  cancelledBookingId: string,
): Promise<{
  originalBooking: {
    id: string;
    categoryId: string;
    subcategoryId: string | null;
    city: string;
    province: string;
    scheduledAt: string;
    description: string;
  };
  previousProviders: RebookingSuggestion[];
  availableProviders: RebookingSuggestion[];
}> {
  const bookingResult = await db.query<{
    id: string;
    customer_id: string;
    category_id: string;
    subcategory_id: string | null;
    city: string;
    province: string;
    scheduled_at: Date;
    description: string;
    latitude: string | null;
    longitude: string | null;
    cancelled_provider_id: string | null;
  }>(
    `SELECT b.id, b.customer_id, b.category_id, b.subcategory_id,
            b.city, b.province, b.scheduled_at, b.description,
            b.latitude, b.longitude, b.provider_id AS cancelled_provider_id
     FROM bookings b
     WHERE b.id = $1 AND b.customer_id = $2
       AND b.status IN ('cancelled_by_provider', 'cancelled_by_admin')`,
    [cancelledBookingId, customerId],
  );

  if (bookingResult.rows.length === 0) {
    throw createAppError('Cancelled booking not found.', 404);
  }

  const booking = bookingResult.rows[0]!;

  const previousProviders = await db.query<BookingHistoryRow>(
    `SELECT
       p.id AS provider_id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS provider_name,
       p.business_name,
       p.rating::text AS rating,
       p.total_reviews,
       p.total_jobs,
       p.tier,
       ps.base_price,
       COUNT(b.id)::text AS booking_count
     FROM bookings b
     INNER JOIN providers p ON b.provider_id = p.id
     INNER JOIN users u ON p.user_id = u.id
     LEFT JOIN provider_services ps ON ps.provider_id = p.id
       AND ps.subcategory_id = $3 AND ps.is_active = TRUE
     WHERE b.customer_id = $1
       AND b.provider_id IS NOT NULL
       AND b.provider_id != COALESCE($4, '00000000-0000-0000-0000-000000000000'::uuid)
       AND p.status = 'approved'
       AND b.status IN ('confirmed', 'payout_ready', 'paid_out')
       AND (ps.category_id = $2 OR ps.category_id IS NULL)
     GROUP BY p.id, u.first_name, u.last_name, p.business_name,
              p.rating, p.total_reviews, p.total_jobs, p.tier, ps.base_price
     ORDER BY COUNT(b.id) DESC, p.rating DESC
     LIMIT 5`,
    [customerId, booking.category_id, booking.subcategory_id, booking.cancelled_provider_id],
  );

  // MED-N152 fix — only suggest providers whose service_radius_km
  // actually covers the booking's location. Pre-fix the city/province
  // ILIKE was a coarse text match: a provider in Manila with a 5km
  // service radius would be suggested for a Boracay booking just
  // because both rows had province='Aklan' (false positive from
  // ILIKE on a substring). Post-fix: when the booking has lat/lng
  // and the provider has lat/lng, we apply the same Haversine +
  // service_radius_km filter that matching.service.ts uses.
  // When the booking lacks coordinates, we fall back to the prior
  // ILIKE behavior (degraded mode but no false negatives at launch).
  const hasCoords = booking.latitude !== null && booking.longitude !== null;
  const EARTH_RADIUS_KM = 6371;
  const availableProviders = await db.query<AvailableProviderRow>(
    hasCoords
      ? `SELECT DISTINCT ON (p.id)
           p.id AS provider_id,
           TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS provider_name,
           p.business_name,
           p.rating::text AS rating,
           p.total_reviews,
           p.total_jobs,
           p.tier,
           ps.base_price,
           p.latitude::text AS latitude,
           p.longitude::text AS longitude
         FROM providers p
         INNER JOIN users u ON p.user_id = u.id
         INNER JOIN provider_services ps ON ps.provider_id = p.id
           AND ps.is_active = TRUE AND ps.category_id = $1
         WHERE p.status = 'approved'
           AND p.id != COALESCE($5, '00000000-0000-0000-0000-000000000000'::uuid)
           AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
           AND ($4::uuid IS NULL OR ps.subcategory_id = $4)
           AND (
             ${EARTH_RADIUS_KM} * acos(
               LEAST(1.0, GREATEST(-1.0,
                 cos(radians($2::numeric)) * cos(radians(p.latitude::numeric))
                 * cos(radians(p.longitude::numeric) - radians($3::numeric))
                 + sin(radians($2::numeric)) * sin(radians(p.latitude::numeric))
               ))
             )
           ) <= p.service_radius_km
         ORDER BY p.id, p.rating DESC
         LIMIT 10`
      : `SELECT DISTINCT ON (p.id)
           p.id AS provider_id,
           TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS provider_name,
           p.business_name,
           p.rating::text AS rating,
           p.total_reviews,
           p.total_jobs,
           p.tier,
           ps.base_price,
           p.latitude::text AS latitude,
           p.longitude::text AS longitude
         FROM providers p
         INNER JOIN users u ON p.user_id = u.id
         INNER JOIN provider_services ps ON ps.provider_id = p.id
           AND ps.is_active = TRUE AND ps.category_id = $1
         WHERE p.status = 'approved'
           AND p.id != COALESCE($5, '00000000-0000-0000-0000-000000000000'::uuid)
           AND (p.city ILIKE $2 OR p.province ILIKE $3)
           AND ($4::uuid IS NULL OR ps.subcategory_id = $4)
         ORDER BY p.id, p.rating DESC
         LIMIT 10`,
    hasCoords
      ? [
          booking.category_id,
          Number(booking.latitude),
          Number(booking.longitude),
          booking.subcategory_id,
          booking.cancelled_provider_id,
        ]
      : [
          booking.category_id,
          `%${booking.city}%`,
          `%${booking.province}%`,
          booking.subcategory_id,
          booking.cancelled_provider_id,
        ],
  );

  const previousProviderIds = new Set(previousProviders.rows.map((r) => r.provider_id));

  const formatSuggestion = (
    row: BookingHistoryRow | AvailableProviderRow,
    isPrevious: boolean,
  ): RebookingSuggestion => ({
    providerId: row.provider_id,
    providerName: row.provider_name,
    businessName: row.business_name,
    averageRating: row.rating,
    totalReviews: row.total_reviews,
    totalJobsCompleted: row.total_jobs,
    tier: row.tier,
    basePrice: row.base_price,
    distanceKm: null,
    previouslyBooked: isPrevious,
  });

  logger.info('Rebooking suggestions generated', {
    cancelledBookingId,
    previousCount: previousProviders.rows.length,
    availableCount: availableProviders.rows.length,
  });

  return {
    originalBooking: {
      id: booking.id,
      categoryId: booking.category_id,
      subcategoryId: booking.subcategory_id,
      city: booking.city,
      province: booking.province,
      scheduledAt: booking.scheduled_at.toISOString(),
      description: booking.description,
    },
    previousProviders: previousProviders.rows.map((r) => formatSuggestion(r, true)),
    availableProviders: availableProviders.rows
      .filter((r) => !previousProviderIds.has(r.provider_id))
      .map((r) => formatSuggestion(r, false)),
  };
}

export async function getCustomerBookingHistory(
  customerId: string,
  categoryId?: string,
  limit = 10,
): Promise<Array<{
  bookingId: string;
  categoryName: string;
  subcategoryName: string | null;
  providerName: string;
  providerId: string;
  scheduledAt: string;
  totalAmount: number;
  status: string;
}>> {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const conditions = ['b.customer_id = $1', "b.status IN ('confirmed', 'payout_ready', 'paid_out')"];
  const params: unknown[] = [customerId];
  let paramIndex = 2;

  if (categoryId) {
    conditions.push(`b.category_id = $${paramIndex++}`);
    params.push(categoryId);
  }

  params.push(safeLimit);

  const result = await db.query<{
    booking_id: string;
    category_name: string;
    subcategory_name: string | null;
    provider_name: string;
    provider_id: string;
    scheduled_at: Date;
    total_amount: number;
    status: string;
  }>(
    `SELECT
       b.id AS booking_id,
       COALESCE(sc.name, 'Service') AS category_name,
       ss.name AS subcategory_name,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS provider_name,
       b.provider_id,
       b.scheduled_at,
       b.total_amount,
       b.status
     FROM bookings b
     LEFT JOIN service_categories sc ON b.category_id = sc.id
     LEFT JOIN service_subcategories ss ON b.subcategory_id = ss.id
     LEFT JOIN providers p ON b.provider_id = p.id
     LEFT JOIN users u ON p.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.scheduled_at DESC
     LIMIT $${paramIndex}`,
    params,
  );

  return result.rows.map((r) => ({
    bookingId: r.booking_id,
    categoryName: r.category_name,
    subcategoryName: r.subcategory_name,
    providerName: r.provider_name,
    providerId: r.provider_id,
    scheduledAt: r.scheduled_at.toISOString(),
    totalAmount: r.total_amount,
    status: r.status,
  }));
}
