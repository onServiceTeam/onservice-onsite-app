// packages/api/src/middleware/admin-csrf.middleware.ts
//
// CSRF protection for admin write endpoints. Phase 14 Dispatch 01 Bug 1251.
//
// Threat model: an XSS payload anywhere on a domain that can fetch admin URLs
// would be able to issue authenticated requests using the HttpOnly admin
// session cookie (browser sends cookies automatically on same-origin
// requests). The CSRF check forces every write to also carry a header
// matching a value JS read from a non-HttpOnly cookie — XSS can read that
// cookie, BUT cross-origin attacks (the more common CSRF vector) cannot.
// Combined with SameSite=Strict on the session cookie, this closes the
// residual cross-origin attack surface.
//
// The middleware:
//   1. Skips read-only methods (GET, HEAD, OPTIONS).
//   2. Skips public endpoints (admin login itself doesn't have a session yet).
//      Caller decides which routes to apply this middleware to.
//   3. Compares the X-CSRF-Token request header to the admin_csrf cookie.
//      Mismatch or missing → 403 csrf_invalid.
//   4. Verifies the token exists in admin_csrf_tokens (not revoked, not
//      expired). Failure → 403 csrf_invalid.
//
// Usage in route files:
//   router.post('/admin/...', requireAdminAuth, requireAdminCsrf, async (req, res) => { ... })

import type { Request, Response, NextFunction } from 'express';
import { db } from '../models/db';
import { logger } from '../utils/logger';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function requireAdminCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const headerToken =
    (req.header('x-csrf-token') ?? req.header('X-CSRF-Token') ?? '').trim();
  // Express needs cookie-parser middleware mounted earlier for req.cookies.
  // If req.cookies is not present at all, treat as missing — fail closed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookieToken = ((req as any).cookies?.admin_csrf as string | undefined ?? '').trim();

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    res.status(403).json({
      success: false,
      error: {
        code: 'csrf_invalid',
        message: 'CSRF token missing or mismatched.',
      },
    });
    return;
  }

  // Verify the token exists, is not revoked, and is not expired.
  const result = await db.query<{ id: string; admin_user_id: string }>(
    `SELECT id, admin_user_id
       FROM admin_csrf_tokens
      WHERE token = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [headerToken],
  );

  if (result.rows.length === 0) {
    logger.warn('admin_csrf_unknown_token', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });
    res.status(403).json({
      success: false,
      error: {
        code: 'csrf_invalid',
        message: 'CSRF token unknown or expired.',
      },
    });
    return;
  }

  next();
}
