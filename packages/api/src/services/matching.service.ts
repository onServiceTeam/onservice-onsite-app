import { db } from '../models/db';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as settingsService from './settings.service';

/**
 * Provider matching algorithm (FR-051).
 *
 * 1. Filter providers by: category match, service area, availability, status=approved
 * 2. Score: (rating * 0.4) + (distance_inverse * 0.3) + (acceptance_rate * 0.2) + (tier_bonus * 0.1)
 * 3. Return ranked list; caller handles the 45s offer chain.
 */

interface MatchableProvider {
  provider_id: string;
  user_id: string;
  business_name: string;
  tier: string;
  rating: number;
  total_jobs: number;
  total_reviews: number;
  service_radius_km: number;
  latitude: string;
  longitude: string;
  distance_km: number;
}

export interface ScoredProvider {
  providerId: string;
  userId: string;
  businessName: string;
  tier: string;
  rating: number;
  totalJobs: number;
  distanceKm: number;
  score: number;
}

// MED-N102 fix: 'founding' tier added (migration 073 + DECISION-003).
// Founding providers are an invite-only batch with high engagement, so
// they get the same matching boost as 'pro'-tier providers (between
// verified and elite). This pairs with the platformConfig.commissionRates
// addition so all 5 tiers are recognized end-to-end.
//
// MED-N102 (D-J23) admin-tunability: the weights are read from
// platform_settings.matching_tier_bonus (JSON object) so ops can boost
// or suppress a tier without a code deploy. Falls back to these
// in-code defaults when the setting is missing or returns invalid JSON.
const TIER_BONUS_DEFAULTS: Record<string, number> = {
  founding: 0.5,
  new: 0.0,
  verified: 0.25,
  pro: 0.5,
  elite: 1.0,
};

async function loadTierBonus(): Promise<Record<string, number>> {
  try {
    const raw = await settingsService.getSetting('matching_tier_bonus');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          out[k] = v;
        }
      }
      if (Object.keys(out).length > 0) return out;
    }
  } catch (err) {
    logger.warn('matching_tier_bonus setting unreadable; using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return TIER_BONUS_DEFAULTS;
}

const MAX_MATCH_ATTEMPTS = 10;
const EARTH_RADIUS_KM = 6371;

function haversineDistanceSQL(): string {
  return `(
    ${EARTH_RADIUS_KM} * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians($2::numeric)) * cos(radians(p.latitude::numeric))
        * cos(radians(p.longitude::numeric) - radians($3::numeric))
        + sin(radians($2::numeric)) * sin(radians(p.latitude::numeric))
      ))
    )
  )`;
}

export async function findMatchingProviders(
  categoryId: string,
  subcategoryId: string | null,
  customerLat: number,
  customerLng: number,
  scheduledAt: Date,
): Promise<ScoredProvider[]> {
  const dayOfWeek = scheduledAt.getDay();
  const timeStr = scheduledAt.toTimeString().slice(0, 8);

  const distanceExpr = haversineDistanceSQL();

  const result = await db.query<MatchableProvider>(
    `SELECT DISTINCT ON (p.id)
       p.id AS provider_id,
       p.user_id,
       p.business_name,
       p.tier,
       p.rating,
       p.total_jobs,
       p.total_reviews,
       p.service_radius_km,
       p.latitude,
       p.longitude,
       ${distanceExpr} AS distance_km
     FROM providers p
     JOIN provider_services ps ON ps.provider_id = p.id AND ps.is_active = TRUE
     WHERE p.status = 'approved'
       AND p.is_available = TRUE
       AND p.latitude IS NOT NULL
       AND p.longitude IS NOT NULL
       AND ps.category_id = $1
       ${subcategoryId ? 'AND (ps.subcategory_id = $4 OR ps.subcategory_id IS NULL)' : ''}
       AND ${distanceExpr} <= p.service_radius_km
       AND EXISTS (
         SELECT 1 FROM provider_availability pa
         WHERE pa.provider_id = p.id
           AND pa.day_of_week = ${subcategoryId ? '$5' : '$4'}
           AND pa.is_available = TRUE
           -- MED-N104 fix — overnight schedule support. When start_time
           -- <= end_time the schedule is same-day (e.g., 09:00-17:00).
           -- When start_time > end_time the schedule wraps midnight
           -- (e.g., bartender 22:00-06:00) and we accept times >= start
           -- OR <= end. Pre-fix: pa.end_time >= $time always failed
           -- the wrapping case so overnight providers were never matched.
           AND (
             (pa.start_time <= pa.end_time
               AND pa.start_time <= ${subcategoryId ? '$6' : '$5'}::time
               AND pa.end_time   >= ${subcategoryId ? '$6' : '$5'}::time)
             OR
             (pa.start_time > pa.end_time
               AND (${subcategoryId ? '$6' : '$5'}::time >= pa.start_time
                    OR ${subcategoryId ? '$6' : '$5'}::time <= pa.end_time))
           )
       )
     ORDER BY p.id, ${distanceExpr} ASC
     LIMIT $${subcategoryId ? '7' : '6'}`,
    subcategoryId
      ? [categoryId, customerLat, customerLng, subcategoryId, dayOfWeek, timeStr, MAX_MATCH_ATTEMPTS * 3]
      : [categoryId, customerLat, customerLng, dayOfWeek, timeStr, MAX_MATCH_ATTEMPTS * 3],
  );

  if (result.rows.length === 0) {
    return [];
  }

  const maxDistance = Math.max(...result.rows.map((r) => r.distance_km), 1);
  const tierBonus = await loadTierBonus();

  const scored: ScoredProvider[] = result.rows.map((p) => {
    const ratingScore = (p.rating / 5) * 0.4;
    const distanceScore = (1 - p.distance_km / maxDistance) * 0.3;
    const acceptanceRate = p.total_jobs / Math.max(p.total_reviews + p.total_jobs, 1);
    const acceptanceScore = acceptanceRate * 0.2;
    const tierScore = (tierBonus[p.tier] ?? 0) * 0.1;

    return {
      providerId: p.provider_id,
      userId: p.user_id,
      businessName: p.business_name,
      tier: p.tier,
      rating: p.rating,
      totalJobs: p.total_jobs,
      distanceKm: Math.round(p.distance_km * 100) / 100,
      score: Math.round((ratingScore + distanceScore + acceptanceScore + tierScore) * 1000) / 1000,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  logger.info('Provider matching complete', {
    categoryId,
    candidateCount: scored.length,
    topScore: scored[0]?.score,
  });

  return scored.slice(0, MAX_MATCH_ATTEMPTS);
}

export async function findMatchingProvidersSimple(
  categoryId: string,
  customerLat: number,
  customerLng: number,
  // MED-N103 fix — scheduledAt is now REQUIRED for the simple matcher
  // so it can apply the same provider_availability filter as the full
  // matcher. Pre-fix: simple matcher returned providers without
  // checking their working hours, so a 03:00 booking could be matched
  // to a provider whose schedule is 09:00-17:00. Post-fix: same
  // overnight-aware availability join as findMatchingProviders.
  scheduledAt: Date,
): Promise<ScoredProvider[]> {
  const distanceExpr = haversineDistanceSQL();
  const dayOfWeek = scheduledAt.getDay();
  const timeStr = scheduledAt.toTimeString().slice(0, 8);

  const result = await db.query<MatchableProvider>(
    `SELECT DISTINCT ON (p.id)
       p.id AS provider_id,
       p.user_id,
       p.business_name,
       p.tier,
       p.rating,
       p.total_jobs,
       p.total_reviews,
       p.service_radius_km,
       p.latitude,
       p.longitude,
       ${distanceExpr} AS distance_km
     FROM providers p
     JOIN provider_services ps ON ps.provider_id = p.id AND ps.is_active = TRUE
     WHERE p.status = 'approved'
       AND p.is_available = TRUE
       AND p.latitude IS NOT NULL
       AND p.longitude IS NOT NULL
       AND ps.category_id = $1
       AND ${distanceExpr} <= p.service_radius_km
       AND EXISTS (
         SELECT 1 FROM provider_availability pa
         WHERE pa.provider_id = p.id
           AND pa.day_of_week = $4
           AND pa.is_available = TRUE
           AND (
             (pa.start_time <= pa.end_time
               AND pa.start_time <= $5::time
               AND pa.end_time   >= $5::time)
             OR
             (pa.start_time > pa.end_time
               AND ($5::time >= pa.start_time
                    OR $5::time <= pa.end_time))
           )
       )
     ORDER BY p.id, p.rating DESC, ${distanceExpr} ASC
     LIMIT $6`,
    [categoryId, customerLat, customerLng, dayOfWeek, timeStr, MAX_MATCH_ATTEMPTS],
  );

  if (result.rows.length === 0) return [];

  const maxDistance = Math.max(...result.rows.map((r) => r.distance_km), 1);
  const tierBonus = await loadTierBonus();

  return result.rows.map((p) => {
    const ratingScore = (p.rating / 5) * 0.4;
    const distanceScore = (1 - p.distance_km / maxDistance) * 0.3;
    const acceptanceRate = p.total_jobs / Math.max(p.total_reviews + p.total_jobs, 1);
    const acceptanceScore = acceptanceRate * 0.2;
    const tierScore = (tierBonus[p.tier] ?? 0) * 0.1;

    return {
      providerId: p.provider_id,
      userId: p.user_id,
      businessName: p.business_name,
      tier: p.tier,
      rating: p.rating,
      totalJobs: p.total_jobs,
      distanceKm: Math.round(p.distance_km * 100) / 100,
      score: Math.round((ratingScore + distanceScore + acceptanceScore + tierScore) * 1000) / 1000,
    };
  }).sort((a, b) => b.score - a.score);
}

export function getMatchConfig(): Record<string, unknown> {
  return {
    maxAttempts: MAX_MATCH_ATTEMPTS,
    offerTimeoutSeconds: 45,
    maxWaitMinutes: 5,
    scoringWeights: { rating: 0.4, distance: 0.3, acceptance: 0.2, tier: 0.1 },
    maxServiceRadiusKm: platformConfig.maxServiceRadius,
  };
}

/**
 * Checks if a provider already has an overlapping booking at the given time.
 * Uses the booking's estimated duration (defaulting to platformConfig.defaultServiceDurationMinutes)
 * to detect conflicts.
 *
 * @returns true if the provider is already booked (conflict exists)
 */
export async function hasBookingConflict(
  providerId: string,
  scheduledAt: Date,
  estimatedDurationMinutes: number = platformConfig.defaultServiceDurationMinutes,
  excludeBookingId?: string,
): Promise<boolean> {
  // MED-N105 fix — use ACTUAL existing-booking durations to detect
  // overlap, not just a default-sized window around the new booking.
  // Pre-fix: a 6h booking starting at 09:00 would not conflict with a
  // new booking at 12:00 because the window-around-new-12:00 (±2h
  // default) didn't extend back to 09:00. Post-fix: each existing
  // booking carries its own estimated_duration_minutes (via
  // booking_quotes or pricing rules), and we test true interval
  // overlap: existing.end > new.start AND existing.start < new.end.
  // We still take the larger of (new duration, default) to bound the
  // new-booking side.
  const newDurationMs = Math.max(estimatedDurationMinutes, platformConfig.defaultServiceDurationMinutes) * 60 * 1000;
  const newStart = scheduledAt.toISOString();
  const newEnd = new Date(scheduledAt.getTime() + newDurationMs).toISOString();

  const result = await db.query<{ id: string }>(
    `SELECT b.id FROM bookings b
     LEFT JOIN booking_quotes bq ON bq.booking_id = b.id AND bq.is_active = TRUE
     WHERE b.provider_id = $1
       AND b.status NOT IN (
         'cancelled_by_customer','cancelled_by_provider','cancelled_by_admin',
         'paid_out','rejected','expired'
       )
       -- existing booking's end > new booking's start
       -- existing booking's start < new booking's end
       AND b.scheduled_at < $3::timestamptz
       AND (b.scheduled_at + (
         INTERVAL '1 minute' *
         COALESCE(bq.estimated_duration_minutes, $4::int)
       )) > $2::timestamptz
       ${excludeBookingId ? 'AND b.id != $5' : ''}
     LIMIT 1`,
    excludeBookingId
      ? [providerId, newStart, newEnd, platformConfig.defaultServiceDurationMinutes, excludeBookingId]
      : [providerId, newStart, newEnd, platformConfig.defaultServiceDurationMinutes],
  );

  return result.rows.length > 0;
}
