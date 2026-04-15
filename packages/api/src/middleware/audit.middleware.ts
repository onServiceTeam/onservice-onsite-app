import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../utils/logger';

/**
 * Audit logging middleware.
 * Logs all write operations (POST, PUT, PATCH, DELETE) for compliance.
 */
export function auditMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (writeMethods.includes(req.method)) {
    const originalSend = res.json.bind(res);

    res.json = function (body: unknown) {
      logger.info('Audit log', {
        userId: req.user?.userId || 'anonymous',
        role: req.user?.role || 'unauthenticated',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return originalSend(body);
    };
  }

  next();
}
