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
 * Verifies the Bearer token and attaches user payload to req.user.
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(createAppError('Authentication required. Please log in.', 401));
    return;
  }

  const token = authHeader.split(' ')[1];

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
