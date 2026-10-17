/**
 * D24 Option A address search: the small shared state kept in Redis.
 *
 *   - the cool-down: set after Google refuses us (billing off, key not
 *     allowed, quota) or times out, so the API stops calling Google for a few
 *     minutes (admin setting address_search_cooldown_minutes);
 *   - daily call counters, one set per Asia/Manila calendar day, for the
 *     per-user caps, the platform-wide cap (Ken's bill guard) and the admin
 *     status card;
 *   - the last status word Google returned, for the admin status card.
 *
 * Nothing here holds what a customer typed, a coordinate, an address or the
 * server key. Counter keys carry the user id (already in many Redis keys) and
 * the Manila date only.
 *
 * Imports only Redis, so settings.service.ts can read the cool-down and
 * today's platform count for GET /api/v1/config without an import cycle.
 */
import { redis } from '../../config/redis.config';

export const ADDRESS_SEARCH_REDIS_PREFIX = 'geo:address-search';
export const ADDRESS_SEARCH_COOLDOWN_KEY = `${ADDRESS_SEARCH_REDIS_PREFIX}:cooldown`;
export const ADDRESS_SEARCH_LAST_STATUS_KEY = `${ADDRESS_SEARCH_REDIS_PREFIX}:last-status`;

/** Day counters live two days, so the status card can still read "today" just after midnight. */
export const ADDRESS_SEARCH_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;
/** The last-status record is kept a week. */
export const ADDRESS_SEARCH_LAST_STATUS_TTL_SECONDS = 7 * 24 * 60 * 60;
/**
 * Every Redis call here is bounded. The shared client queues commands while
 * it reconnects, so without a bound a Redis outage would hang the request
 * (and GET /api/v1/config) instead of failing closed.
 */
export const ADDRESS_SEARCH_REDIS_TIMEOUT_MS = 1_000;

export type AddressSearchOperation = 'autocomplete' | 'details' | 'reverse';
/** Per-user caps: typing suggestions, and the two lookups (place details plus pin-to-address). */
export type AddressSearchUserBucket = 'autocomplete' | 'lookup';

export function userBucketFor(operation: AddressSearchOperation): AddressSearchUserBucket {
  return operation === 'autocomplete' ? 'autocomplete' : 'lookup';
}

const MANILA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The Asia/Manila calendar date as YYYY-MM-DD (the caps reset at Manila midnight). */
export function manilaDay(now: Date = new Date()): string {
  return MANILA_DAY.format(now);
}

export const addressSearchKeys = {
  platformTotal: (day: string): string => `${ADDRESS_SEARCH_REDIS_PREFIX}:${day}:all`,
  platformOperation: (day: string, operation: AddressSearchOperation): string =>
    `${ADDRESS_SEARCH_REDIS_PREFIX}:${day}:op:${operation}`,
  user: (day: string, userId: string, bucket: AddressSearchUserBucket): string =>
    `${ADDRESS_SEARCH_REDIS_PREFIX}:${day}:user:${userId}:${bucket}`,
};

/** Resolve within the bound or reject; the losing promise's late result is ignored. */
export async function withRedisTimeout<T>(work: Promise<T>, timeoutMs = ADDRESS_SEARCH_REDIS_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('address_search_redis_timeout')), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface AddressSearchCooldown {
  /** When calls to Google may start again (ISO time). */
  until: string;
  /** The Google status word that started the cool-down, for example REQUEST_DENIED. */
  status: string;
}

function parseCooldown(raw: unknown): AddressSearchCooldown | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AddressSearchCooldown>;
    if (typeof parsed.until === 'string' && Number.isFinite(Date.parse(parsed.until))
        && typeof parsed.status === 'string') {
      // A record whose time has passed is not a cool-down, even if Redis has
      // not expired it yet.
      return Date.parse(parsed.until) > Date.now() ? { until: parsed.until, status: parsed.status } : null;
    }
  } catch {
    // Unreadable record: treat as a cool-down that ends when Redis expires it.
  }
  return { until: new Date(Date.now() + 60_000).toISOString(), status: 'UNKNOWN' };
}

/** The active cool-down, or null. Throws when Redis cannot answer in time. */
export async function readAddressSearchCooldown(): Promise<AddressSearchCooldown | null> {
  return parseCooldown(await withRedisTimeout(redis.get(ADDRESS_SEARCH_COOLDOWN_KEY)));
}

/** The three daily caps, already held to their migration 189 bounds. */
export interface AddressSearchCaps {
  userDailyAutocompleteLimit: number;
  userDailyLookupLimit: number;
  platformDailyLimit: number;
}

/**
 * Whether the caps leave any Google call possible today: the platform cap is
 * not 0 and not yet reached, and at least one per-user cap is not 0. Used by
 * GET /api/v1/config and the admin status card, so neither says "available"
 * while every call would be refused. A single user's own cap is not part of
 * this (the config is the same for everyone); the app hides search for the
 * rest of the day after a 429.
 */
export function addressSearchCapsAllowCalls(caps: AddressSearchCaps, platformTotalToday: number): boolean {
  return caps.platformDailyLimit > 0
    && (caps.userDailyAutocompleteLimit > 0 || caps.userDailyLookupLimit > 0)
    && platformTotalToday < caps.platformDailyLimit;
}

/** Google address calls counted so far on this Manila day. Throws when Redis cannot answer in time. */
export async function readPlatformTotalToday(now: Date = new Date()): Promise<number> {
  const raw = await withRedisTimeout(redis.get(addressSearchKeys.platformTotal(manilaDay(now))));
  const count = Number(raw ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

/**
 * For GET /api/v1/config, after the key and the switch were checked: true
 * only when no cool-down is running and the caps leave calls for today. A
 * cap set to 0 is checked before Redis is asked. Any Redis failure reads as
 * "not available", because the search endpoints refuse without Redis (the
 * caps cannot be counted), so the apps must not offer search then.
 */
export async function isAddressSearchOpenToday(caps: AddressSearchCaps): Promise<boolean> {
  if (!addressSearchCapsAllowCalls(caps, 0)) return false;
  try {
    if ((await readAddressSearchCooldown()) !== null) return false;
    return addressSearchCapsAllowCalls(caps, await readPlatformTotalToday());
  } catch {
    return false;
  }
}
