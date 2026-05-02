import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { platformConfig } from '../config/platform.config';
import * as settingsService from '../services/settings.service';
import { logger } from '../utils/logger';

/**
 * CRIT-M01 fix — rate-limit middleware now actually honors live
 * settings changes from the admin panel.
 *
 * Pre-fix: the limiter was constructed ONCE at module load with
 * primitives `currentWindow` and `currentMax`. The 60-second
 * setInterval mutated those primitives but `rateLimit()` had already
 * captured them — so admin changes to rate_limit_window_ms /
 * rate_limit_max_requests were silently ignored until process restart.
 *
 * Post-fix:
 *   1. The exported `rateLimitMiddleware` is a thin Express middleware
 *      wrapper that delegates to an internal `rateLimit()` instance.
 *   2. The internal instance is rebuilt on demand whenever the cached
 *      windowMs or limit changes (rebuild only on diff to keep the
 *      shared in-memory store stable when nothing changed).
 *   3. `limit` is also passed as a function to `rateLimit()` itself,
 *      which v8 supports — so per-request limit changes apply
 *      immediately without rebuild.
 *   4. `initRateLimit()` is exported and awaited once from server.ts
 *      before mounting the middleware, so the initial DB read is
 *      complete before the limiter is hot.
 */

let currentWindow: number = platformConfig.rateLimitWindowMs;
let currentMax: number = platformConfig.rateLimitMaxRequests;

let activeWindow: number = currentWindow;
let activeLimiter: RateLimitRequestHandler = buildLimiter(currentWindow);

function buildLimiter(windowMs: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    // express-rate-limit v8: `limit` may be a function evaluated per
    // request, so admin changes to currentMax take effect immediately
    // without rebuilding the limiter or losing in-memory hit counters.
    limit: () => currentMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        message: 'Too many requests. Please try again later.',
        statusCode: 429,
      },
    },
  });
}

export async function refreshRateLimits(): Promise<void> {
  try {
    const nextWindow = await settingsService.getSettingInteger('rate_limit_window_ms');
    const nextMax = await settingsService.getSettingInteger('rate_limit_max_requests');
    currentWindow = nextWindow;
    currentMax = nextMax;
    // windowMs cannot be a function in express-rate-limit, so when it
    // actually changes we have to rebuild the underlying limiter.
    if (currentWindow !== activeWindow) {
      activeLimiter = buildLimiter(currentWindow);
      activeWindow = currentWindow;
      logger.info('Rate-limit windowMs changed; limiter rebuilt', {
        windowMs: currentWindow,
        max: currentMax,
      });
    }
  } catch (err) {
    logger.warn('Rate-limit settings refresh failed; keeping current values', {
      error: (err as Error).message,
    });
  }
}

/**
 * Init hook — call from server.ts BEFORE mounting `rateLimitMiddleware`
 * so the first request sees DB-backed values, not platformConfig
 * defaults that may differ.
 */
export async function initRateLimit(): Promise<void> {
  await refreshRateLimits();
  // Periodic refresh continues after init.
  setInterval(() => { void refreshRateLimits(); }, 60_000).unref();
}

/**
 * Public middleware. Stable function reference (always === itself),
 * but the underlying limiter it delegates to may change between calls
 * if `windowMs` was tuned in the admin panel.
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Cast through unknown to satisfy express-rate-limit's broader handler type.
  (activeLimiter as unknown as (
    r: Request,
    s: Response,
    n: NextFunction,
  ) => void)(req, res, next);
}

/** Test-only hook to force-rebuild the limiter (used by jest specs). */
export function __forceRebuildForTest(windowMs: number, max: number): void {
  currentWindow = windowMs;
  currentMax = max;
  activeLimiter = buildLimiter(windowMs);
  activeWindow = windowMs;
}

/** Test-only hook to read the cached values. */
export function __getCachedForTest(): { windowMs: number; max: number } {
  return { windowMs: currentWindow, max: currentMax };
}
