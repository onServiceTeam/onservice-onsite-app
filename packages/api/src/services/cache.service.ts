import { redis } from '../config/redis.config';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as settingsService from './settings.service';

/**
 * Redis cache layer for API response caching.
 * Follows the TTL strategy from EXPANSION-v2-SDLC-SRS Section 3.
 * All TTL values sourced from platformConfig.cacheTtl.
 */

export const CacheTTL = {
  CATEGORIES: platformConfig.cacheTtl.categories,
  SUBCATEGORIES: platformConfig.cacheTtl.subcategories,
  PROVIDER_PROFILE: platformConfig.cacheTtl.providerProfile,
  PROVIDER_RATING: platformConfig.cacheTtl.providerRating,
  USER_PROFILE: platformConfig.cacheTtl.userProfile,
  BOOKING_STATUS: platformConfig.cacheTtl.bookingStatus,
  SEARCH_RESULTS: platformConfig.cacheTtl.searchResults,
  SERVICE_AREAS: platformConfig.cacheTtl.serviceAreas,
} as const;

export type RuntimeCacheTtl = 'categories' | 'searchResults';

/** Resolve the two admin-owned HTTP-cache durations with migration bounds. */
export async function getRuntimeCacheTtl(kind: RuntimeCacheTtl): Promise<number> {
  if (kind === 'categories') {
    const configured = await settingsService.getSettingInteger('cache_ttl_categories');
    return Number.isSafeInteger(configured) && configured >= 60 && configured <= 604_800
      ? configured
      : CacheTTL.CATEGORIES;
  }
  const configured = await settingsService.getSettingInteger('cache_ttl_search_results');
  return Number.isSafeInteger(configured) && configured >= 30 && configured <= 3_600
    ? configured
    : CacheTTL.SEARCH_RESULTS;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch (err) {
    logger.error('Cache read error', {
      key,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return null;
  }
}

export async function cacheSet(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    logger.error('Cache write error', {
      key,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.error('Cache delete error', {
      key,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.error('Cache pattern delete error', {
      pattern,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

export function buildCacheKey(...parts: (string | number)[]): string {
  return `onservice:${parts.join(':')}`;
}
