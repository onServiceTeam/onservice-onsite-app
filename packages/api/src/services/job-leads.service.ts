/**
 * D27 Phase 1 — custom-quote lead discovery.
 *
 * Before this, createJobRequest wrote a quote_based 'requested' booking but
 * nothing ever told a provider about it, so custom-quote requests went nowhere.
 * This module (a) fans a notification out to category + service-area matched
 * providers when a request lands, and (b) lets a provider pull the list of open
 * requests they can quote. Quotes stay PULL-based: providers are notified and
 * choose to quote (unlike fixed-price instant dispatch which auto-assigns).
 */
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import * as notificationService from './notification.service';
import { emitToUser } from './socket.service';

const EARTH_RADIUS_KM = 6371;
const MAX_LEAD_NOTIFY = 30;

/** Haversine distance (km) from a fixed lat/lng param pair to a row's lat/lng cols. */
function haversineSQL(latParam: string, lngParam: string, latCol: string, lngCol: string): string {
  return `(${EARTH_RADIUS_KM} * acos(LEAST(1.0, GREATEST(-1.0,
    cos(radians(${latParam}::numeric)) * cos(radians(${latCol}::numeric))
      * cos(radians(${lngCol}::numeric) - radians(${lngParam}::numeric))
    + sin(radians(${latParam}::numeric)) * sin(radians(${latCol}::numeric))
  ))))`;
}

/**
 * Notify approved providers who serve this job-request's category about a new
 * lead. When the request has coordinates, only providers within their own
 * service radius are notified (providers without coordinates are still
 * included as a fallback). Best-effort: a failure to notify one provider never
 * blocks the others or the request itself.
 */
export async function notifyProvidersOfJobRequest(booking: {
  id: string;
  category_id: string;
  latitude: number | string | null;
  longitude: number | string | null;
  city: string | null;
}): Promise<number> {
  const dist = haversineSQL('$2', '$3', 'p.latitude', 'p.longitude');
  const providers = await db.query<{ user_id: string }>(
    // provider_services.category_id is nullable (migration 013): a provider can
    // register a service by subcategory only. Match either the category directly
    // OR a subcategory that rolls up to this category, so subcategory-only
    // providers still receive the lead.
    `SELECT DISTINCT p.user_id
       FROM providers p
       JOIN provider_services ps
         ON ps.provider_id = p.id AND ps.is_active = TRUE
        AND ( ps.category_id = $1
              OR ps.subcategory_id IN (SELECT id FROM service_subcategories WHERE category_id = $1) )
      WHERE p.status = 'approved'
        AND (
          $2::numeric IS NULL OR $3::numeric IS NULL
          OR p.latitude IS NULL OR p.longitude IS NULL
          OR ${dist} <= COALESCE(p.service_radius_km, 1000000)
        )
      LIMIT ${MAX_LEAD_NOTIFY}`,
    [booking.category_id, booking.latitude, booking.longitude],
  );

  const cat = await db.query<{ name: string }>(
    `SELECT name FROM service_categories WHERE id = $1`,
    [booking.category_id],
  );
  const serviceName = cat.rows[0]?.name ?? 'a service';
  const city = booking.city ?? 'your area';

  let notified = 0;
  for (const r of providers.rows) {
    try {
      await notificationService.sendPushNotification(
        r.user_id,
        'New quote request',
        `A customer needs ${serviceName} in ${city}. Tap to send a quote.`,
        'new_job_request',
        { bookingId: booking.id, serviceName, city },
      );
      emitToUser(r.user_id, 'new:job_request', { bookingId: booking.id, serviceName, city });
      notified += 1;
    } catch (err) {
      logger.warn('Lead notify failed for provider', { userId: r.user_id, err: String(err) });
    }
  }

  logger.info('Job request fanned out to providers', { bookingId: booking.id, matched: providers.rows.length, notified });
  return notified;
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
  jobPhotos: string[];
  jobVideoUrl: string | null;
  intakeAnswers: Record<string, unknown> | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  customerName: string;
  distanceKm: number | null;
  createdAt: string;
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
  job_photos: string[] | null;
  job_video_url: string | null;
  intake_answers: Record<string, unknown> | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  customer_first: string;
  customer_last: string;
  distance_km: string | null;
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
    jobPhotos: row.job_photos ?? [],
    jobVideoUrl: row.job_video_url,
    intakeAnswers: row.intake_answers,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    customerName: `${row.customer_first} ${row.customer_last}`.trim(),
    distanceKm: row.distance_km != null ? Math.round(Number(row.distance_km) * 10) / 10 : null,
    createdAt: row.created_at.toISOString(),
  };
}

function openLeadWhere(distanceSql: string): string {
  return `
       b.booking_type = 'quote_based'
       AND b.status IN ('requested', 'quoted')
       AND b.category_id IN (
         SELECT ps.category_id FROM provider_services ps
          WHERE ps.provider_id = $1 AND ps.is_active = TRUE AND ps.category_id IS NOT NULL
         UNION
         SELECT ssc.category_id FROM provider_services ps
           JOIN service_subcategories ssc ON ssc.id = ps.subcategory_id
          WHERE ps.provider_id = $1 AND ps.is_active = TRUE
       )
       AND NOT EXISTS (SELECT 1 FROM booking_quotes q WHERE q.booking_id = b.id AND q.provider_id = $1)
       AND NOT EXISTS (SELECT 1 FROM booking_quotes q2 WHERE q2.booking_id = b.id AND q2.status = 'accepted')
       AND (
         $2::numeric IS NULL OR $3::numeric IS NULL OR b.latitude IS NULL OR b.longitude IS NULL
         OR ${distanceSql} <= COALESCE($4::numeric, 1000000)
       )`;
}

/**
 * Open custom-quote requests a given provider can quote: quote_based bookings
 * still at status 'requested', in one of the provider's active categories, that
 * the provider has not already quoted and that have no accepted quote yet. When
 * both the provider and the request have coordinates, filtered to within the
 * provider's service radius and annotated with distance.
 */
export async function getOpenJobRequestsForProvider(
  providerUserId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ requests: OpenJobRequest[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const prov = await db.query<{
    id: string;
    latitude: string | null;
    longitude: string | null;
    service_radius_km: number | null;
  }>(`SELECT id, latitude, longitude, service_radius_km FROM providers WHERE user_id = $1`, [providerUserId]);
  const p = prov.rows[0];
  if (!p) throw createAppError('Provider profile not found.', 404);

  // $1 provider id, $2 plat, $3 plng, $4 radius, then paging params.
  const dist = haversineSQL('$2', '$3', 'b.latitude', 'b.longitude');
  const whereCore = openLeadWhere(dist);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM bookings b WHERE ${whereCore}`,
    [p.id, p.latitude, p.longitude, p.service_radius_km],
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const rows = await db.query<OpenJobRequestRow>(
    `SELECT b.id, b.category_id, sc.name AS category_name,
            COALESCE(sub.name, sc.name) AS service_name, b.subcategory_id,
            b.description, b.urgency, b.budget_min, b.budget_max,
            b.job_photos, b.job_video_url, b.intake_answers, b.barangay, b.city, b.province,
            u.first_name AS customer_first, u.last_name AS customer_last,
            CASE WHEN $2::numeric IS NOT NULL AND $3::numeric IS NOT NULL
                  AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
                 THEN ${dist} ELSE NULL END AS distance_km,
            b.created_at
       FROM bookings b
       JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
       JOIN users u ON u.id = b.customer_id
      WHERE ${whereCore}
      ORDER BY b.created_at DESC
      LIMIT $5 OFFSET $6`,
    [p.id, p.latitude, p.longitude, p.service_radius_km, pageSize, offset],
  );

  const requests = rows.rows.map(mapOpenJobRequest);

  return { requests, total, page, pageSize };
}

export async function getOpenJobRequestForProvider(
  providerUserId: string,
  bookingId: string,
): Promise<OpenJobRequest> {
  const providerResult = await db.query<{
    id: string;
    latitude: string | null;
    longitude: string | null;
    service_radius_km: number | null;
  }>(
    `SELECT id, latitude, longitude, service_radius_km
       FROM providers
      WHERE user_id = $1 AND status = 'approved'`,
    [providerUserId],
  );
  const provider = providerResult.rows[0];
  if (!provider) throw createAppError('Provider profile not found.', 404);

  const distanceSql = haversineSQL('$2', '$3', 'b.latitude', 'b.longitude');
  const result = await db.query<OpenJobRequestRow>(
    `SELECT b.id, b.category_id, sc.name AS category_name,
            COALESCE(sub.name, sc.name) AS service_name, b.subcategory_id,
            b.description, b.urgency, b.budget_min, b.budget_max,
            b.job_photos, b.job_video_url, b.intake_answers, b.barangay, b.city, b.province,
            u.first_name AS customer_first, u.last_name AS customer_last,
            CASE WHEN $2::numeric IS NOT NULL AND $3::numeric IS NOT NULL
                  AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
                 THEN ${distanceSql} ELSE NULL END AS distance_km,
            b.created_at
       FROM bookings b
       JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
       JOIN users u ON u.id = b.customer_id
      WHERE ${openLeadWhere(distanceSql)}
        AND b.id = $5
      LIMIT 1`,
    [provider.id, provider.latitude, provider.longitude, provider.service_radius_km, bookingId],
  );
  const request = result.rows[0];
  if (!request) {
    // Hide requests outside this provider's active services/radius and requests
    // already won by another provider.
    throw createAppError('Job request not found.', 404);
  }
  return mapOpenJobRequest(request);
}
