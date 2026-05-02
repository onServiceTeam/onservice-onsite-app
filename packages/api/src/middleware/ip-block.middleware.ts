import { Request, Response, NextFunction } from 'express';
import * as securityService from '../services/security.service';
import { logger } from '../utils/logger';

/**
 * MED-M01 follow-up — getClientIp now relies on Express's `app.set('trust proxy', N)`
 * (CRIT-M05 fix) so req.ip is correct. Reading X-Forwarded-For directly
 * here was a footgun: pre-trust-proxy any client could spoof their IP
 * for ip-block purposes. Post-trust-proxy Express does the right thing
 * (returns the leftmost untrusted hop). This helper falls back to
 * req.socket.remoteAddress if req.ip is somehow empty (test env).
 */
export function getClientIp(req: Request): string {
  // req.ip is populated by Express based on the trust proxy setting
  // (server.ts: app.set('trust proxy', TRUST_PROXY_HOPS)).
  if (typeof req.ip === 'string' && req.ip.length > 0) {
    return req.ip;
  }
  return req.socket.remoteAddress ?? '127.0.0.1';
}

/**
 * Sensitive paths where ip-block check failure should fail CLOSED.
 * MED-M02 fix — pre-fix the catch block always called next() (fail
 * open), so any Redis/DB outage gave attackers a free window. Money,
 * compliance, and admin paths now return 503 instead of allowing the
 * request through. Public read paths still fail open (availability >
 * security) since the worst case is a few unblocked requests, not
 * money movement.
 */
const FAIL_CLOSED_PREFIXES: ReadonlyArray<string> = [
  '/api/v1/admin',
  '/api/v1/payouts',
  '/api/v1/wallet',
  '/api/v1/payments',
  '/api/v1/webhooks',
  '/api/v1/compliance',
  '/api/v1/bir-admin',
  '/api/v1/dispute-admin',
];

export async function ipBlockMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clientIp = getClientIp(req);

    const blocked = await securityService.isIpBlocked(clientIp);

    if (blocked) {
      logger.warn('Blocked IP attempted access', { ip: clientIp, path: req.path });
      res.status(403).json({
        success: false,
        error: {
          message: 'Access denied.',
          statusCode: 403,
        },
      });
      return;
    }

    next();
  } catch (err) {
    // MED-M02 fix — fail closed on sensitive paths, fail open on the rest.
    const isSensitive = FAIL_CLOSED_PREFIXES.some((p) => req.path.startsWith(p));
    if (isSensitive) {
      logger.error('IP block check failed on sensitive path — failing closed (503)', {
        path: req.path,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      res.status(503).json({
        success: false,
        error: {
          message: 'Service temporarily unavailable. Please try again shortly.',
          statusCode: 503,
        },
      });
      return;
    }
    logger.error('IP block check failed on non-sensitive path — failing open', {
      path: req.path,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    next();
  }
}
