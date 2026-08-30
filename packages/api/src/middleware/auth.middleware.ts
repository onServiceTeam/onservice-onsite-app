import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createAppError } from './error.middleware';
import { requireAdminCsrf } from './admin-csrf.middleware';
import { logger } from '../utils/logger';
import { db } from '../models/db';

// E01 / D15 (2026-05-02) — `dpo` is a real role for NPC RA 10173 §21
// segregation of duties. JWTs may now be signed with role='dpo'.
export interface AuthPayload {
  userId: string;
  // D23 — `provider_staff` is a team member with their own scoped login.
  role: 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo' | 'provider_staff';
  /**
   * Migration 158 account-session generation. Tokens minted before migration
   * 158 have no claim and are treated as generation 1 only.
   */
  sessionVersion?: number;
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
  res: Response,
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

  const rejectRevokedSession = (): void => {
    const revoked = createAppError('Your session is no longer valid. Please sign in again.', 401);
    (revoked as { code?: string }).code = 'session_revoked';
    next(revoked);
  };

  const authenticate = async (): Promise<void> => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable is not set');
      next(createAppError('Server configuration error.', 500));
      return;
    }

    let payload: AuthPayload & { type?: string };
    try {
      payload = jwt.verify(token, jwtSecret) as AuthPayload & { type?: string };

      // Reject pre-auth (2FA pending) and refresh tokens from being used as access tokens
      if (payload.type === 'pre_auth_2fa' || payload.type === 'refresh') {
        next(createAppError('Invalid authentication token.', 401));
        return;
      }
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
      return;
    }

    // UX-558 / migration 158 — a signed token is not sufficient authority.
    // Reload the canonical account state on every protected request so role
    // changes and deactivation take effect immediately. A missing version on a
    // pre-migration token means generation 1, never "whatever is current".
    try {
      const canonical = await db.query<{
        role: AuthPayload['role'];
        is_active: boolean;
        session_version: number | string;
      }>(
        `SELECT role, is_active, session_version
           FROM users
          WHERE id = $1`,
        [payload.userId],
      );
      const account = canonical.rows[0];
      if (!account || !account.is_active) {
        rejectRevokedSession();
        return;
      }

      const tokenVersion = Number(payload.sessionVersion ?? 1);
      const currentVersion = Number(account.session_version);
      if (account.role !== payload.role
          || !Number.isSafeInteger(tokenVersion)
          || tokenVersion < 1
          || !Number.isSafeInteger(currentVersion)
          || currentVersion < 1
          || currentVersion !== tokenVersion) {
        rejectRevokedSession();
        return;
      }

      req.user = {
        ...payload,
        role: account.role,
        sessionVersion: currentVersion,
      };

      // UX-556 — CSRF follows the credential, not a URL prefix. Admin pages
      // also write through mixed route families such as /staff and
      // /support-tickets. Canonical account validation runs before the CSRF
      // identity check, so a revoked role/session cannot reach a write route.
      if (cookieToken) {
        await requireAdminCsrf(req, res, next);
        return;
      }
      next();
    } catch (err) {
      logger.error('Canonical authentication state lookup failed', {
        userId: payload.userId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      next(createAppError('Unable to validate the authentication session.', 500));
    }
  };

  void authenticate();
}
