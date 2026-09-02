import rateLimit, { RateLimitRequestHandler, ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { platformConfig } from '../config/platform.config';
import * as settingsService from '../services/settings.service';
import { redis } from '../config/redis.config';
import { logger } from '../utils/logger';

// CRIT-PHASE17-03 fix — back the rate-limit store with Redis instead
// of the default in-memory map.
//
// Pre-fix:
//   * Counters reset on every API restart, so abusive clients only
//     paid the limit for as long as the process was up.
//   * In production behind multiple API replicas (k8s/ECS), each
//     replica had its own counters, effectively allowing N×limit
//     total requests where N is the replica count.
//
// Post-fix: rate-limit-redis uses the existing ioredis client. All
// replicas share the same counters, restarts preserve them, and the
// 1-replica dev case is unchanged behaviorally except that counters
// now persist across `npm run dev` restarts (which is what we want
// for testing too).
type RedisStoreOpts = ConstructorParameters<typeof RedisStore>[0];

function buildRedisStore(prefix: string): InstanceType<typeof RedisStore> {
  // rate-limit-redis defines two Options shapes: SingleOptions has
  // `sendCommand`, ClusterOptions has `sendCommandCluster`. We use
  // single-node Redis. The discriminated union confuses TS unless we
  // build the object as the explicit single-options shape first.
  const opts = {
    prefix,
    sendCommand: (...args: string[]): Promise<unknown> =>
      (redis as unknown as { call: (...a: string[]) => Promise<unknown> }).call(...args),
  } as unknown as RedisStoreOpts;
  return new RedisStore(opts);
}

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
 *   4. `initRateLimit()` starts the live-settings refresh loop during
 *      server startup. Conservative deployment defaults cover requests
 *      while that first best-effort database read completes.
 */

let currentWindow: number = platformConfig.rateLimitWindowMs;
let currentMax: number = platformConfig.rateLimitMaxRequests;

let activeWindow: number = currentWindow;

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Keep authentic server-signed customer/provider/admin credentials out of one
 * carrier-NAT bucket.
 * Signature verification is required before a token can select a user key, so
 * an attacker cannot rotate unsigned token strings to bypass the IP budget.
 * Expired or otherwise invalid credentials remain IP-scoped. The downstream
 * auth middleware still enforces canonical account state and role authority.
 */
export function globalRateLimitKey(req: Request): string {
  const cookies = (req as Request & {
    cookies?: Record<string, unknown>;
  }).cookies ?? {};
  const authorization = req.headers.authorization;
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  const bodyRefresh = typeof (req.body as { refreshToken?: unknown } | undefined)?.refreshToken === 'string'
    ? (req.body as { refreshToken: string }).refreshToken.trim()
    : '';
  const candidates = [
    typeof cookies.admin_session === 'string' ? cookies.admin_session.trim() : '',
    bearer,
    typeof cookies.admin_refresh === 'string' ? cookies.admin_refresh.trim() : '',
    bodyRefresh,
  ];
  const secret = process.env.JWT_SECRET;

  if (secret) {
    for (const token of candidates) {
      if (token.length < 16 || token.length > 4096) continue;
      try {
        const payload = jwt.verify(token, secret, {
          algorithms: ['HS256'],
        }) as { userId?: unknown };
        if (typeof payload.userId === 'string' && USER_ID_PATTERN.test(payload.userId)) {
          return `u:${payload.userId.toLowerCase()}`;
        }
      } catch {
        // Invalid, forged, or otherwise unusable credentials remain IP-scoped.
      }
    }
  }

  return ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? '');
}

function buildLimiter(windowMs: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    // Test-mode (staging only, never production) lifts the cap for QA testers.
    limit: () => (platformConfig.rateLimitsRelaxed ? 1_000_000 : currentMax),
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRedisStore('rl:global:'),
    keyGenerator: globalRateLimitKey,
    message: {
      success: false,
      error: {
        message: 'Too many requests. Please try again later.',
        statusCode: 429,
      },
    },
  });
}

let activeLimiter: RateLimitRequestHandler = buildLimiter(currentWindow);

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
 * Init hook called from server startup. The middleware is already mounted,
 * so its conservative platformConfig defaults remain active until this
 * best-effort database read completes.
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

// ── Phase C CRIT-46 fix — auth-specific stricter rate limiter ──
//
// Pre-fix: ALL endpoints shared the same rate limiter (from
// platform_settings.rate_limit_max_requests, default 100 per 15 minutes). Auth
// endpoints (OTP request, OTP verify, admin login, refresh) needed
// to be MUCH stricter so credential-stuffing / OTP spam attacks
// can't burn through the broad limit.
//
// Post-fix: a dedicated authRateLimitMiddleware reads its own
// settings keys (auth_rate_limit_window_ms, auth_rate_limit_max_requests)
// with conservative defaults (10 requests / 60s). Routes for
// /auth/send-otp, /auth/verify-otp, /auth/admin/login, and
// /auth/admin/2fa/verify apply this in addition to the global limiter.
// Routine token refresh is intentionally excluded from this low per-IP
// credential-attempt budget because mobile carrier NATs and shared offices
// can place many legitimate sessions behind one address.
//
// The settings keys default to:
//   auth_rate_limit_window_ms: 60000  (1 minute)
//   auth_rate_limit_max_requests: 10
// — operator can tune via Settings UI.

let authCurrentWindow: number = 60_000;
let authCurrentMax: number = 10;
let authActiveWindow: number = authCurrentWindow;

function buildAuthLimiter(windowMs: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    // Test-mode (staging only, never production) lifts the cap for QA testers.
    limit: () => (platformConfig.rateLimitsRelaxed ? 1_000_000 : authCurrentMax),
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRedisStore('rl:auth:'),
    message: {
      success: false,
      error: {
        message: 'Too many authentication attempts. Please wait a moment and try again.',
        statusCode: 429,
      },
    },
  });
}

let authActiveLimiter: RateLimitRequestHandler = buildAuthLimiter(authCurrentWindow);

export async function refreshAuthRateLimits(): Promise<void> {
  try {
    const fetched = await Promise.all([
      settingsService.getSettingInteger('auth_rate_limit_window_ms').catch(() => authCurrentWindow),
      settingsService.getSettingInteger('auth_rate_limit_max_requests').catch(() => authCurrentMax),
    ]);
    const [nextWindow, nextMax] = fetched;
    authCurrentWindow = Number.isFinite(nextWindow) && nextWindow > 0 ? Number(nextWindow) : authCurrentWindow;
    authCurrentMax = Number.isFinite(nextMax) && nextMax > 0 ? Number(nextMax) : authCurrentMax;
    if (authCurrentWindow !== authActiveWindow) {
      authActiveLimiter = buildAuthLimiter(authCurrentWindow);
      authActiveWindow = authCurrentWindow;
      logger.info('Auth rate-limit windowMs changed; limiter rebuilt', {
        windowMs: authCurrentWindow,
        max: authCurrentMax,
      });
    }
  } catch (err) {
    logger.warn('Auth rate-limit settings refresh failed; keeping current values', {
      error: (err as Error).message,
    });
  }
}

export async function initAuthRateLimit(): Promise<void> {
  await refreshAuthRateLimits();
  setInterval(() => { void refreshAuthRateLimits(); }, 60_000).unref();
}

export function authRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  (authActiveLimiter as unknown as (
    r: Request,
    s: Response,
    n: NextFunction,
  ) => void)(req, res, next);
}

export function __getAuthCachedForTest(): { windowMs: number; max: number } {
  return { windowMs: authCurrentWindow, max: authCurrentMax };
}

// ── §35c fix — per-user upload quota ──────────────────────────────
//
// File uploads are expensive (storage cost + S3 PUT cost + bandwidth)
// and the global limiter keys by IP, so a single authenticated user
// behind a shared NAT/proxy could either be throttled by unrelated
// traffic or, the other way, burn storage by spamming the upload
// endpoints. This dedicated limiter keys by the AUTHENTICATED USER id
// (upload routes always run authMiddleware first) and is much stricter
// than the global limiter. Each request may still carry up to
// maxImagesPerBooking files, so this bounds total stored objects to
// (max requests × maxImagesPerBooking) per window per user.
//
// Settings keys (operator-tunable, conservative defaults):
//   upload_rate_limit_window_ms: 60000  (1 minute)
//   upload_rate_limit_max_requests: 30
let uploadCurrentWindow: number = 60_000;
let uploadCurrentMax: number = 30;
let uploadActiveWindow: number = uploadCurrentWindow;

function buildUploadLimiter(windowMs: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    // Test-mode (staging only, never production) lifts the cap for QA testers.
    limit: () => (platformConfig.rateLimitsRelaxed ? 1_000_000 : uploadCurrentMax),
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRedisStore('rl:upload:'),
    // Key by authenticated user; fall back to the IPv6-safe IP key for
    // the (shouldn't-happen) unauthenticated case.
    keyGenerator: (req: Request): string => {
      const uid = (req as Request & { user?: { userId?: string } }).user?.userId;
      return uid ? `u:${uid}` : ipKeyGenerator(req.ip ?? '');
    },
    message: {
      success: false,
      error: {
        message: 'Too many uploads. Please wait a moment and try again.',
        statusCode: 429,
      },
    },
  });
}

let uploadActiveLimiter: RateLimitRequestHandler = buildUploadLimiter(uploadCurrentWindow);

export async function refreshUploadRateLimits(): Promise<void> {
  try {
    const fetched = await Promise.all([
      settingsService.getSettingInteger('upload_rate_limit_window_ms').catch(() => uploadCurrentWindow),
      settingsService.getSettingInteger('upload_rate_limit_max_requests').catch(() => uploadCurrentMax),
    ]);
    const [nextWindow, nextMax] = fetched;
    uploadCurrentWindow = Number.isFinite(nextWindow) && nextWindow > 0 ? Number(nextWindow) : uploadCurrentWindow;
    uploadCurrentMax = Number.isFinite(nextMax) && nextMax > 0 ? Number(nextMax) : uploadCurrentMax;
    if (uploadCurrentWindow !== uploadActiveWindow) {
      uploadActiveLimiter = buildUploadLimiter(uploadCurrentWindow);
      uploadActiveWindow = uploadCurrentWindow;
      logger.info('Upload rate-limit windowMs changed; limiter rebuilt', {
        windowMs: uploadCurrentWindow,
        max: uploadCurrentMax,
      });
    }
  } catch (err) {
    logger.warn('Upload rate-limit settings refresh failed; keeping current values', {
      error: (err as Error).message,
    });
  }
}

export async function initUploadRateLimit(): Promise<void> {
  await refreshUploadRateLimits();
  setInterval(() => { void refreshUploadRateLimits(); }, 60_000).unref();
}

export function uploadRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  (uploadActiveLimiter as unknown as (
    r: Request,
    s: Response,
    n: NextFunction,
  ) => void)(req, res, next);
}

export function __getUploadCachedForTest(): { windowMs: number; max: number } {
  return { windowMs: uploadCurrentWindow, max: uploadCurrentMax };
}
