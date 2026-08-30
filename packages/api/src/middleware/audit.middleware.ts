import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../utils/logger';
import { db } from '../models/db';

/**
 * Dormant audit-middleware prototype. E37 records that this module is not
 * mounted by the API and must not be described as global coverage.
 *
 * Pre-fix: failed audit_log INSERTs were caught with a logger.error
 * and silently dropped. Per NPC RA 10173 §22 (records of processing
 * activities), the platform must keep a verifiable audit trail. A
 * silently-broken audit middleware violates that requirement, AND
 * gives compromised admins a window where their actions disappear
 * from the trail.
 *
 * If a replacement is approved, the intended safeguards included here are:
 *   1. The catch handler still logs (so the error doesn't disappear),
 *      but ALSO increments an exported counter so /healthz or a cron
 *      alert can detect "audit insert failure rate above threshold"
 *      and page on-call.
 *   2. After N consecutive failures (default 10) the middleware
 *      switches to fail-closed mode for sensitive paths until the
 *      next successful write — same FAIL_CLOSED_PREFIXES set as
 *      ip-block.middleware.
 *   3. The failure log includes the audit row payload so an operator
 *      can manually backfill from grep'd error logs if needed.
 */

// These metrics are dormant while the middleware is unmounted. They are not
// currently exposed by /healthz; E37 requires monitored evidence before use.
export const auditFailureMetrics = {
  consecutiveFailures: 0,
  totalFailures: 0,
  totalWrites: 0,
  lastFailureAt: null as Date | null,
  lastFailureMessage: null as string | null,
};

/** Threshold beyond which sensitive endpoints fail closed. */
const FAIL_CLOSED_THRESHOLD = 10;

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

/**
 * Unmounted audit logging prototype.
 *
 * Do not mount this as a shortcut. It writes after the response, has no shared
 * request/outcome correlation contract, and cannot currently guarantee a
 * durable record for a successful state change. See E37.
 */
export function auditMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (writeMethods.includes(req.method)) {
    // MED-M03 — refuse the request entirely if we're past the failure
    // threshold AND the path is sensitive. Caller sees 503 so they can
    // retry once monitoring brings audit_log back; without this check
    // the request would succeed with the audit trail silently broken.
    if (
      auditFailureMetrics.consecutiveFailures >= FAIL_CLOSED_THRESHOLD &&
      FAIL_CLOSED_PREFIXES.some((p) => req.path.startsWith(p))
    ) {
      logger.error('Audit subsystem failing — refusing sensitive write to preserve compliance trail', {
        path: req.path,
        consecutiveFailures: auditFailureMetrics.consecutiveFailures,
        lastFailureMessage: auditFailureMetrics.lastFailureMessage,
      });
      res.status(503).json({
        success: false,
        error: {
          message: 'Audit logging unavailable. Please retry in a moment.',
          statusCode: 503,
        },
      });
      return;
    }

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

      auditFailureMetrics.totalWrites += 1;
      void db.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [userId, action, entityType, entityId, ip, userAgent],
      ).then(() => {
        // Reset consecutive counter on success — single success
        // re-opens the fail-closed gate. totalFailures keeps
        // accumulating for monitoring history.
        auditFailureMetrics.consecutiveFailures = 0;
      }).catch((err) => {
        auditFailureMetrics.consecutiveFailures += 1;
        auditFailureMetrics.totalFailures += 1;
        auditFailureMetrics.lastFailureAt = new Date();
        auditFailureMetrics.lastFailureMessage =
          err instanceof Error ? err.message : String(err);
        // Include the lost row payload so a Sentry alert / log scraper
        // can manually backfill if the DB recovers later.
        logger.error('Failed to write audit log to DB', {
          error: err instanceof Error ? err.message : String(err),
          rowPayload: { userId, action, entityType, entityId, ip, userAgent },
          consecutiveFailures: auditFailureMetrics.consecutiveFailures,
        });
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
