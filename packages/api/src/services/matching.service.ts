import { db } from '../models/db';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

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

const TIER_BONUS: Record<string, number> = {
  new: 0.0,
  verified: 0.25,
  pro: 0.5,
  elite: 1.0,
};

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
           AND pa.start_time <= ${subcategoryId ? '$6' : '$5'}::time
           AND pa.end_time >= ${subcategoryId ? '$6' : '$5'}::time
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

  const scored: ScoredProvider[] = result.rows.map((p) => {
    const ratingScore = (p.rating / 5) * 0.4;
    const distanceScore = (1 - p.distance_km / maxDistance) * 0.3;
    const acceptanceRate = p.total_jobs / Math.max(p.total_reviews + p.total_jobs, 1);
    const acceptanceScore = acceptanceRate * 0.2;
    const tierScore = (TIER_BONUS[p.tier] ?? 0) * 0.1;

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
): Promise<ScoredProvider[]> {
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
       AND ${distanceExpr} <= p.service_radius_km
     ORDER BY p.id, p.rating DESC, ${distanceExpr} ASC
     LIMIT $4`,
    [categoryId, customerLat, customerLng, MAX_MATCH_ATTEMPTS],
  );

  if (result.rows.length === 0) return [];

  const maxDistance = Math.max(...result.rows.map((r) => r.distance_km), 1);

  return result.rows.map((p) => {
    const ratingScore = (p.rating / 5) * 0.4;
    const distanceScore = (1 - p.distance_km / maxDistance) * 0.3;
    const acceptanceRate = p.total_jobs / Math.max(p.total_reviews + p.total_jobs, 1);
    const acceptanceScore = acceptanceRate * 0.2;
    const tierScore = (TIER_BONUS[p.tier] ?? 0) * 0.1;

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

export function getMatchConfig() {
  return {
    maxAttempts: MAX_MATCH_ATTEMPTS,
    offerTimeoutSeconds: 45,
    maxWaitMinutes: 5,
    scoringWeights: { rating: 0.4, distance: 0.3, acceptance: 0.2, tier: 0.1 },
    maxServiceRadiusKm: platformConfig.maxServiceRadius,
  };
}
