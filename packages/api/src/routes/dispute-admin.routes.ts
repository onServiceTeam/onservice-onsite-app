/**
 * Phase 07 — Dispute Detail admin routes.
 * Mounted at `/api/v1/admin/disputes/:id/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * `resolve` is super_admin only because it can move money. The legacy `reopen`
 * route remains super_admin-gated but fails closed under E51 until an immutable
 * appeal/compensating-action model exists.
 *
 * Audit: coverage is action-specific. The global middleware is not mounted;
 *        E37 tracks the gap. Service-written `admin_actions` remain canonical.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as disputeAdminService from '../services/dispute-admin.service';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

// ─── Detail (read) ──────────────────────────────────────────────────────────

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await disputeAdminService.getDisputeFullDetail((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Assign ─────────────────────────────────────────────────────────────────

router.post(
  '/:id/assign',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { assigneeAdminId } = req.body ?? {};
      if (!assigneeAdminId || typeof assigneeAdminId !== 'string') {
        throw createAppError('assigneeAdminId is required.', 400);
      }
      const data = await disputeAdminService.adminAssignDispute(
        (req.params.id as string),
        assigneeAdminId,
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Resolve (super_admin) ──────────────────────────────────────────────────

router.post(
  '/:id/resolve',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { resolutionType, refundPercent, decisionNotes, internalNotes } = req.body ?? {};
      const valid = new Set([
        'full_refund', 'partial_refund', 'no_refund', 'free_redo',
        'refund_with_warning', 'refund_with_suspension', 'split_decision',
      ]);
      if (!valid.has(String(resolutionType))) {
        throw createAppError('Invalid resolutionType.', 400);
      }
      const data = await disputeAdminService.adminResolveDispute(
        (req.params.id as string),
        {
          resolutionType: resolutionType as
            'full_refund' | 'partial_refund' | 'no_refund' | 'free_redo' |
            'refund_with_warning' | 'refund_with_suspension' | 'split_decision',
          refundPercent: refundPercent !== undefined ? Number(refundPercent) : undefined,
          decisionNotes: String(decisionNotes ?? ''),
          internalNotes: typeof internalNotes === 'string' ? internalNotes : undefined,
        },
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Escalate ───────────────────────────────────────────────────────────────

router.post(
  '/:id/escalate',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { reason } = req.body ?? {};
      const data = await disputeAdminService.adminEscalateDispute(
        (req.params.id as string),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Send message (admin) ───────────────────────────────────────────────────

router.post(
  '/:id/message',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { recipient, message } = req.body ?? {};
      if (recipient !== 'customer' && recipient !== 'provider' && recipient !== 'both') {
        throw createAppError('recipient must be one of: customer, provider, both.', 400);
      }
      const data = await disputeAdminService.sendDisputeMessage(
        (req.params.id as string),
        recipient,
        String(message ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Reopen (super_admin, temporarily held under E51) ───────────────────────

router.post(
  '/:id/reopen',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { reason } = req.body ?? {};
      const data = await disputeAdminService.reopenDispute(
        (req.params.id as string),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
