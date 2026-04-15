import { Request, Response, NextFunction } from 'express';
import * as securityService from '../services/security.service';
import { logger } from '../utils/logger';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? '127.0.0.1';
}

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
    logger.error('IP block check failed — allowing request', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    next();
  }
}
