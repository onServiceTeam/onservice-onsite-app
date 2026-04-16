import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../models/db';

/**
 * Audit logging middleware.
 * Logs all write operations (POST, PUT, PATCH, DELETE) for compliance.
 * Writes to both the structured logger and the audit_log DB table.
 */
export function auditMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (writeMethods.includes(req.method)) {
    const originalSend = res.json.bind(res);

    res.json = function (body: unknown): Response {
      const userId = req.user?.userId ?? null;
      const action = `${req.method} ${req.path}`;
      const entityType = deriveEntityType(req.path);
      const entityId = deriveEntityId(req.path);
      const ip = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      logger.info('Audit log', {
        userId: userId || 'anonymous',
        role: req.user?.role || 'unauthenticated',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        timestamp: new Date().toISOString(),
        ip,
        userAgent,
      });

      void db.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [userId, action, entityType, entityId, ip, userAgent],
      ).catch((err) => {
        logger.error('Failed to write audit log to DB', { error: err });
      });

      return originalSend(body);
    };
  }

  next();
}

function deriveEntityType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}

function deriveEntityId(path: string): string | null {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = path.match(uuidRegex);
  return match?.[0] ?? null;
}
