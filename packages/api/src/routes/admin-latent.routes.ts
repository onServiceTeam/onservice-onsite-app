/**
 * Phase 28a — wire previously-latent admin services to real HTTP routes.
 *
 * Three services were declared in earlier phases (24a forensic) but had
 * no HTTP exposure. The verbs they emit were also missing from the
 * admin_actions CHECK constraint until migration 120 added them. With
 * the verbs allowed AND these routes wired, admins can finally:
 *
 *   - Decide pending provider applications (approve / reject / sent_back)
 *   - Decide pending service-area-change requests (approve / reject)
 *   - Regenerate admin TOTP backup codes
 *
 * Mounted at `/api/v1/admin` via server.ts. Admin CSRF middleware applies
 * at the mount level for cookie-auth (Bearer auth bypasses per
 * CRIT-PHASE17-02). All routes require super_admin via requireSuperAdmin.
 */

import { Router, type Response, type NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as providerOnboarding from '../services/provider-onboarding.service';
import * as areaChange from '../services/service-area-change.service';
import * as admin2fa from '../services/admin-2fa.service';

const router = Router();

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

// ─── Provider applications ─────────────────────────────────────────────────

router.get(
  '/provider-applications',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
      const data = await providerOnboarding.listPendingReview(limit);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/provider-applications/:userId/decide',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const userId = req.params.userId;
      if (typeof userId !== 'string' || !userId) {
        throw createAppError('userId required.', 400);
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const decision = body.decision;
      const reason = typeof body.reason === 'string' ? body.reason : '';
      if (decision !== 'approved' && decision !== 'rejected' && decision !== 'sent_back') {
        throw createAppError('decision must be approved | rejected | sent_back.', 400);
      }
      const data = await providerOnboarding.adminDecide({
        userId,
        adminUserId: req.user!.userId,
        decision,
        reason,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Service-area change requests ──────────────────────────────────────────

router.get(
  '/service-area-changes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
      const data = await areaChange.listPending(limit);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/service-area-changes/:changeId/decide',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const changeId = req.params.changeId;
      if (typeof changeId !== 'string' || !changeId) {
        throw createAppError('changeId required.', 400);
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const decision = body.decision;
      const reason = typeof body.reason === 'string' ? body.reason : '';
      if (decision !== 'approved' && decision !== 'rejected') {
        throw createAppError('decision must be approved | rejected.', 400);
      }
      const data = await areaChange.decide({
        changeId,
        adminUserId: req.user!.userId,
        decision,
        reason,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Admin TOTP backup codes regeneration ──────────────────────────────────

router.post(
  '/2fa/backup-codes/regenerate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Super-admins regenerate their own backup codes — and may regen
      // codes for other admins via :adminUserId. Self-regen is the
      // common case (lost the old codes); cross-regen is the recovery
      // case (e.g., admin lost both authenticator + backup codes).
      const target = req.body?.adminUserId
        ? String(req.body.adminUserId)
        : req.user!.userId;

      // Anyone other than the user themselves requires super_admin.
      if (target !== req.user!.userId) {
        requireSuperAdmin(req);
      }

      const result = await admin2fa.generateBackupCodes(target, {
        regeneratedBy: req.user!.userId,
      });

      res.status(201).json({
        success: true,
        data: {
          codes: result.codes,
          generatedAt: result.generatedAt,
          warning: 'These codes are shown ONCE. Store them securely; the previous set is invalidated.',
        },
      });
    } catch (error) { next(error); }
  },
);

export default router;
