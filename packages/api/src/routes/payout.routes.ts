import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  requestPayoutSchema,
  approvePayoutSchema,
  rejectPayoutSchema,
  completePayoutSchema,
  clearAmlReviewSchema,
} from '../validators/payout.validators';
import * as payoutService from '../services/payout.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

// MED-N159 fix — money-moving payout endpoints (approve/reject/complete)
// require super_admin per Phase 14 D08 boundary. Junior admin can no
// longer approve their own colleagues' fraudulent payout requests.
function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required for payout decisions.', 403);
  }
}

router.post(
  '/request',
  authMiddleware,
  validationMiddleware(requestPayoutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider') throw createAppError('Only providers can request payouts.', 403);
      const payout = await payoutService.requestPayout(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/my',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'provider') throw createAppError('Only providers can view payouts.', 403);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const { payouts, total } = await payoutService.getMyPayouts(req.user!.userId, { status, page, pageSize });

      res.json({
        success: true,
        data: payouts.map(payoutService.formatPayout),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.getPayoutById(id);

      const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
      if (!isAdmin) {
        interface ProviderRow { id: string }
        const prov = await db.query<ProviderRow>(
          `SELECT id FROM providers WHERE user_id = $1`,
          [req.user!.userId],
        );
        if (prov.rows.length === 0 || prov.rows[0]!.id !== payout.provider_id) {
          throw createAppError('You do not have access to this payout.', 403);
        }
      }

      res.json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const providerId = typeof req.query.providerId === 'string' ? req.query.providerId : undefined;

      const { payouts, total } = await payoutService.listPayouts({ providerId, status, page, pageSize });

      res.json({
        success: true,
        data: payouts.map(payoutService.formatPayout),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id/approve',
  authMiddleware,
  validationMiddleware(approvePayoutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // MED-N159 fix — super_admin only.
      requireSuperAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.approvePayout(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id/reject',
  authMiddleware,
  validationMiddleware(rejectPayoutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // MED-N159 fix — super_admin only.
      requireSuperAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.rejectPayout(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id/complete',
  authMiddleware,
  // BUG-PHASE188-01 fix — pre-fix this route had no validator, so
  // req.body.paymongoTransferId was unbounded and untyped. Same
  // server-cap shape as Phase 152-168 + Phase 179-181. The Zod
  // schema enforces optional string with max 100 chars.
  validationMiddleware(completePayoutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // MED-N159 fix — super_admin only.
      requireSuperAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.completePayout(
        id,
        req.user!.userId,
        req.body.reason,
        req.body.paymongoTransferId,
      );
      res.json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

// MED-N77 fix: super_admin large-transaction review endpoint. Transitions a
// payout from 'aml_review_pending' to 'pending' so the standard
// approve/reject flow can take over. Requires super_admin role
// because this is a senior money/compliance decision.
router.put(
  '/:id/clear-aml-review',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware(clearAmlReviewSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.clearAmlReview(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
