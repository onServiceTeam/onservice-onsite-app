import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createAppError } from './error.middleware';
import { logger } from '../utils/logger';

// E01 / D15 (2026-05-02) — `dpo` is a real role for NPC RA 10173 §21
// segregation of duties. JWTs may now be signed with role='dpo'.
export interface AuthPayload {
  userId: string;
  // D23 — `provider_staff` is a team member with their own scoped login.
  role: 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo' | 'provider_staff';
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

/**
 * JWT authentication middleware.
 * Verifies the access token and attaches user payload to req.user.
 *
 * Token source order (Bug 1251 fix):
 *   1. `admin_session` HttpOnly cookie  — preferred for admin web (XSS cannot read it).
 *   2. `Authorization: Bearer <token>` — used by mobile clients and legacy admin code.
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  // Prefer the HttpOnly admin_session cookie when present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookieToken = ((req as any).cookies?.admin_session as string | undefined ?? '').trim();
  let token = cookieToken;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next(createAppError('Authentication required. Please log in.', 401));
      return;
    }
    token = authHeader.split(' ')[1] ?? '';
  }

  if (!token) {
    next(createAppError('Invalid authentication token.', 401));
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    logger.error('JWT_SECRET environment variable is not set');
    next(createAppError('Server configuration error.', 500));
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as AuthPayload & { type?: string };

    // Reject pre-auth (2FA pending) and refresh tokens from being used as access tokens
    if (payload.type === 'pre_auth_2fa' || payload.type === 'refresh') {
      next(createAppError('Invalid authentication token.', 401));
      return;
    }

    req.user = payload;
    next();
  } catch (err) {
    // MED-M04 fix — distinguish expired vs malformed JWT so the
    // client can take the right action: TokenExpiredError → mobile/
    // admin should silently call refresh; JsonWebTokenError → force
    // re-login. The error code travels in the AppError under `code`
    // so route-level handlers can branch without parsing the message.
    const e = err as { name?: string };
    if (e?.name === 'TokenExpiredError') {
      const expired = createAppError('Authentication token expired.', 401);
      (expired as { code?: string }).code = 'token_expired';
      next(expired);
      return;
    }
    if (e?.name === 'JsonWebTokenError' || e?.name === 'NotBeforeError') {
      const malformed = createAppError('Invalid authentication token.', 401);
      (malformed as { code?: string }).code = 'token_invalid';
      next(malformed);
      return;
    }
    // Unknown error class — keep generic message for safety.
    next(createAppError('Invalid or expired authentication token.', 401));
  }
}
