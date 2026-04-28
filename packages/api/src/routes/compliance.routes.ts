/**
 * Phase 11 — Public compliance routes (end-user facing).
 * Mounted at `/api/v1/compliance`. Auth required (any role).
 *
 * Lets a logged-in user record their own consent decisions and file a
 * data-subject request (NPC right to access/erasure/etc).
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as compliance from '../services/compliance.service';

const router = Router();

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
