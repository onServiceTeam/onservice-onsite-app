/**
 * Phase 11 — Public compliance routes (end-user facing).
 * Mounted at `/api/v1/compliance`. Auth required (any role).
 *
 * Lets a logged-in user record their own consent decisions, file a
 * data-subject request (NPC right to access/erasure/etc), and (per
 * LAUNCH-LIMITATIONS #3 fix) list their own past DSRs.
 *
 * LAUNCH-LIMITATIONS #4 fix — DSR submission is now app-rate-limited
 * (max 5 open DSRs per user / 24h) in addition to the WAF-level rate
 * limit. Pre-fix a malicious or buggy client could spam DSRs.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import * as compliance from '../services/compliance.service';

const router = Router();

const DSR_OPEN_LIMIT_PER_USER_24H = 5;

router.post(
  '/dsr',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const requestType = body.requestType;
      if (typeof requestType !== 'string') {
        throw createAppError('requestType is required.', 400);
      }
      // LAUNCH-LIMITATIONS #4 fix — application-level guard. Counts
      // DSRs created in the last 24h regardless of status (so closed
      // requests still count toward the cap; prevents a malicious
      // submit-then-cancel loop). Returns 429 with a clear message.
      const recentResult = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
           FROM data_subject_requests
          WHERE user_id = $1
            AND received_at >= NOW() - INTERVAL '24 hours'`,
        [req.user!.userId],
      );
      const recentCount = Number(recentResult.rows[0]?.cnt ?? 0);
      if (recentCount >= DSR_OPEN_LIMIT_PER_USER_24H) {
        throw createAppError(
          `You have submitted ${recentCount} data subject requests in the last 24 hours. Please wait before submitting another, or email the DPO for assistance.`,
          429,
        );
      }
      const data = await compliance.createDsr({
        userId: req.user!.userId,
        requestType: requestType as compliance.DsrRequestType,
        userMessage: typeof body.userMessage === 'string' ? body.userMessage : null,
        ipAddress: req.ip ?? null,
      });
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// LAUNCH-LIMITATIONS #3 fix — customer DSR history endpoint.
// Returns the caller's DSR list (most recent first). The mobile
// data-rights screen can list these so customers see status without
// emailing the DPO.
router.get(
  '/my-requests',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;
      const data = await compliance.listMyDsrs(req.user!.userId, limit);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/consent',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const data = await compliance.recordConsent({
        userId: req.user!.userId,
        consentType: typeof body.consentType === 'string' ? body.consentType : '',
        version: typeof body.version === 'string' ? body.version : '',
        granted: body.granted === true,
        ipAddress: req.ip ?? null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      });
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
