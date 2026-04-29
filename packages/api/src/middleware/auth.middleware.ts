import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createAppError } from './error.middleware';
import { logger } from '../utils/logger';

export interface AuthPayload {
  userId: string;
  role: 'customer' | 'provider' | 'admin' | 'super_admin';
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
  } catch {
    next(createAppError('Invalid or expired authentication token.', 401));
  }
}
