import { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet, buildCacheKey } from '../services/cache.service';

/**
 * Express middleware that caches GET responses in Redis.
 * Cache key is derived from the full URL path + query string.
 * Adds Cache-Control header on cache hits.
 */
export function cacheMiddleware(ttlSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = buildCacheKey('http', req.originalUrl);

    const cached = await cacheGet<{ body: unknown; statusCode: number }>(key);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      res.status(cached.statusCode).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheSet(key, { body, statusCode: res.statusCode }, ttlSeconds).catch(() => {});
      }
      res.set('X-Cache', 'MISS');
      res.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      return originalJson(body);
    }) as Response['json'];

    next();
  };
}
