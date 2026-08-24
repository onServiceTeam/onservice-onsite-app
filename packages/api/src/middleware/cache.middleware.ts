import { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet, buildCacheKey } from '../services/cache.service';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Express middleware that caches GET responses in Redis.
 *
 * CRIT-M02 fix — cache key now includes user identity when present.
 *
 * Pre-fix: key = buildCacheKey('http', req.originalUrl). If a route
 * returning user-specific data accidentally used cacheMiddleware (or
 * if cacheMiddleware was applied before authMiddleware on a route
 * that later became authenticated), the FIRST user to populate the
 * cache leaked their data to every subsequent caller hitting the same
 * URL — an info-disclosure vulnerability under NPC RA 10173 §28.
 *
 * Post-fix:
 *   1. If `req.user` is populated, the user's id + role are folded
 *      into the cache key so different users get different entries.
 *   2. As defense-in-depth, if an `Authorization` header or
 *      `admin_session` cookie is present but `req.user` is NOT yet
 *      populated (cacheMiddleware mounted before authMiddleware),
 *      the request is treated as authenticated-without-identity and
 *      the cache is BYPASSED (no read, no write) — fail-closed.
 *   3. If neither user nor auth-credentials are present, the key
 *      stays scoped to the URL only (fast path for public endpoints
 *      like /api/v1/catalog/categories, /api/v1/service-areas).
 */
type CacheTtlSource = number | (() => Promise<number>);

export function cacheMiddleware(ttlSource: CacheTtlSource) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    // Defense-in-depth fail-closed: auth credentials present but no
    // identity attached yet. Means the middleware order is wrong (we
    // were mounted before authMiddleware) — refuse to cache rather
    // than risk a cross-user leak.
    if (!user) {
      const hasAuthHeader =
        typeof req.headers.authorization === 'string' &&
        req.headers.authorization.startsWith('Bearer ');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasSessionCookie = !!((req as any).cookies?.admin_session);
      if (hasAuthHeader || hasSessionCookie) {
        res.set('X-Cache', 'BYPASS');
        next();
        return;
      }
    }

    let ttlSeconds: number;
    try {
      ttlSeconds = typeof ttlSource === 'function' ? await ttlSource() : ttlSource;
    } catch (err) {
      logger.warn('HTTP cache TTL resolution failed; bypassing cache', {
        path: req.originalUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      res.set('X-Cache', 'BYPASS');
      next();
      return;
    }

    // Build a per-identity cache key. For unauthenticated public
    // endpoints `user` is undefined and the key is identical to the
    // pre-fix behavior (URL-only).
    const userScope = user ? `u:${user.userId}:r:${user.role}` : 'anon';
    const key = buildCacheKey('http', `${userScope}|${req.originalUrl}`);

    const cached = await cacheGet<{ body: unknown; statusCode: number }>(key);
    if (cached) {
      res.set('X-Cache', 'HIT');
      // Authenticated responses must not be stored in shared caches
      // (CDNs, proxies) — use private. Public endpoints can stay
      // public so CDNs / browser caches can serve them.
      res.set(
        'Cache-Control',
        user ? `private, max-age=${ttlSeconds}` : `public, max-age=${ttlSeconds}`,
      );
      res.status(cached.statusCode).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheSet(key, { body, statusCode: res.statusCode }, ttlSeconds).catch((err: unknown) => {
          logger.debug('cacheSet best-effort failed in HTTP cache middleware', {
            key,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      res.set('X-Cache', 'MISS');
      res.set(
        'Cache-Control',
        user ? `private, max-age=${ttlSeconds}` : `public, max-age=${ttlSeconds}`,
      );
      return originalJson(body);
    }) as Response['json'];

    next();
  };
}
