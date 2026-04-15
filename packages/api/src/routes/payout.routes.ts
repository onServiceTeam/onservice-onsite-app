import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { requestPayoutSchema, rejectPayoutSchema } from '../validators/payout.validators';
import * as payoutService from '../services/payout.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.approvePayout(id, req.user!.userId);
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
      requireAdmin(req);
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Payout ID is required.', 400);

      const payout = await payoutService.completePayout(id, req.body.paymongoTransferId);
      res.json({ success: true, data: payoutService.formatPayout(payout) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
