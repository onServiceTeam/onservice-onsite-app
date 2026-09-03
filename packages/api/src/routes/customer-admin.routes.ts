/**
 * Phase 06 — Customer 360 admin routes.
 * Mounted at `/api/v1/admin/customers/:id/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Write endpoints that move money or affect compliance are super_admin only.
 *
 * Audit: coverage is action-specific. The global middleware is not mounted;
 * E37 tracks the missing complete and correlated write trail.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as customerAdminService from '../services/customer-admin.service';
import { ALL_BOOKING_STATUSES } from '../types/booking.types';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateCustomerId(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const customerId = req.params.id;
  if (typeof customerId !== 'string' || !UUID_REGEX.test(customerId)) {
    next(createAppError('Customer ID must be a valid UUID.', 400));
    return;
  }
  next();
}

function positiveIntegerQuery(
  value: unknown,
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw createAppError(`${name} must be a positive integer.`, 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw createAppError(`${name} must be between 1 and ${maximum}.`, 400);
  }
  return parsed;
}

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
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      // D25: pass the role so the service masks contact for non-super_admin.
      const data = await customerAdminService.getCustomerProfile(req.params.id as string, req.user!.role);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// D25 — audit-logged reveal of the customer's raw phone + email. Any admin may
// call it (the reveal is the recorded action).
router.post(
  '/:id/reveal-contact',
  authMiddleware,
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await customerAdminService.revealCustomerContact(req.params.id as string, req.user!.userId);
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
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = positiveIntegerQuery(req.query.page, 'page', 1, 100_000);
      const pageSize = positiveIntegerQuery(req.query.pageSize, 'pageSize', 20, 100);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (status && !ALL_BOOKING_STATUSES.includes(status as never)) {
        throw createAppError('status must be a known booking status.', 400);
      }
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
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const transactionId = req.query.transactionId;
      if (
        transactionId !== undefined
        && (typeof transactionId !== 'string' || !UUID_REGEX.test(transactionId))
      ) {
        throw createAppError('transactionId must be a valid UUID.', 400);
      }
      const data = await customerAdminService.getCustomerPayments(
        req.params.id as string,
        transactionId,
      );
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
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = positiveIntegerQuery(req.query.page, 'page', 1, 100_000);
      const pageSize = positiveIntegerQuery(req.query.pageSize, 'pageSize', 20, 100);
      const data = await customerAdminService.getCustomerDisputes(
        req.params.id as string,
        page,
        pageSize,
      );
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
  validateCustomerId,
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
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const limit = positiveIntegerQuery(req.query.limit, 'limit', 50, 200);
      // Forward the authorized operations role so super_admin receives the
      // intended forensic view while plain admin remains masked. DPO is
      // rejected by requireAdmin above and is never upgraded here.
      const role = req.user?.role === 'super_admin' ? 'super_admin' : 'admin';
      const data = await customerAdminService.getCustomerActivity(
        (req.params.id as string), limit, role,
      );
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
  validateCustomerId,
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

router.post(
  '/:id/revoke-sessions',
  authMiddleware,
  validateCustomerId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const data = await customerAdminService.revokeCustomerSessions(
        req.params.id as string,
        String(req.body?.reason ?? ''),
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
  validateCustomerId,
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
