/**
 * Phase 06 — Customer 360 admin routes.
 * Mounted at `/api/v1/admin/customers/:id/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Write endpoints that move money or affect compliance are super_admin only.
 *
 * Audit: writes are captured globally by `auditMiddleware` (POST/PUT/PATCH/DELETE).
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as customerAdminService from '../services/customer-admin.service';

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

// ─── Profile ────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await customerAdminService.getCustomerProfile((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Bookings ───────────────────────────────────────────────────────────────

router.get(
  '/:id/bookings',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 20);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const data = await customerAdminService.getCustomerBookings(
        (req.params.id as string),
        page,
        pageSize,
        status,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Payments ───────────────────────────────────────────────────────────────

router.get(
  '/:id/payments',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await customerAdminService.getCustomerPayments((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Disputes ───────────────────────────────────────────────────────────────

router.get(
  '/:id/disputes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await customerAdminService.getCustomerDisputes((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Referrals ──────────────────────────────────────────────────────────────

router.get(
  '/:id/referrals',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await customerAdminService.getCustomerReferrals((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Activity ───────────────────────────────────────────────────────────────

router.get(
  '/:id/activity',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const limit = Number(req.query.limit ?? 50);
      const data = await customerAdminService.getCustomerActivity((req.params.id as string), limit);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Status (suspend / reactivate / flag fraud) ─────────────────────────────

router.put(
  '/:id/status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { action, reason } = req.body ?? {};
      if (action !== 'suspend' && action !== 'reactivate' && action !== 'flag_fraud') {
        throw createAppError('action must be one of: suspend, reactivate, flag_fraud.', 400);
      }
      const data = await customerAdminService.updateCustomerStatus(
        (req.params.id as string),
        action,
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Wallet credit (super admin) ────────────────────────────────────────────

router.post(
  '/:id/credit',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { amount, reason } = req.body ?? {};
      const data = await customerAdminService.creditCustomerWallet(
        (req.params.id as string),
        Number(amount),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
