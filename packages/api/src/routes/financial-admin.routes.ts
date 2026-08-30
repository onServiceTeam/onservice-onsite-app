/**
 * Phase 08 — Financial admin routes.
 * Mounted at `/api/v1/admin/financials/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Money-affecting writes (OR cancellation) are super_admin only.
 *
 * Audit: coverage is action-specific. The global middleware is not mounted;
 *        E37 tracks the gap. `or.service.cancelOR` writes `admin_actions`.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as financialAdminService from '../services/financial-admin.service';
import * as orService from '../services/or.service';

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

function parseDateRange(req: AuthenticatedRequest): { from: string; to: string } {
  const from = typeof req.query.from === 'string' ? req.query.from : '';
  const to = typeof req.query.to === 'string' ? req.query.to : '';
  if (!from) throw createAppError('from is required.', 400);
  if (!to) throw createAppError('to is required.', 400);
  return { from, to };
}

function parseOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw createAppError(`Invalid ${name}.`, 400);
  return n;
}

// ─── Overview ───────────────────────────────────────────────────────────────

router.get(
  '/overview',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const { from, to } = parseDateRange(req);
      const data = await financialAdminService.getFinancialOverview(from, to);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Revenue breakdown ──────────────────────────────────────────────────────

router.get(
  '/revenue/by-category',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const { from, to } = parseDateRange(req);
      const data = await financialAdminService.getRevenueByCategory(from, to);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/revenue/by-city',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const { from, to } = parseDateRange(req);
      const limit = parseOptionalNumber(req.query.limit, 'limit');
      const data = await financialAdminService.getRevenueByCity(from, to, limit);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/revenue/by-tier',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const { from, to } = parseDateRange(req);
      const data = await financialAdminService.getRevenueByTier(from, to);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/revenue/by-payment',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const { from, to } = parseDateRange(req);
      const data = await financialAdminService.getRevenueByPaymentMethod(from, to);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Escrow / Payouts / Guarantee Fund ──────────────────────────────────────

router.get(
  '/escrow',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await financialAdminService.getEscrowSummary();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/payouts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await financialAdminService.getPayoutsSummary();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/guarantee-fund',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await financialAdminService.getGuaranteeFundSummary();
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Receipts search / detail / cancel ──────────────────────────────────────

router.get(
  '/receipts/search',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const orNumber = typeof req.query.orNumber === 'string' ? req.query.orNumber : undefined;
      const customerName =
        typeof req.query.customerName === 'string' ? req.query.customerName : undefined;
      const providerName =
        typeof req.query.providerName === 'string' ? req.query.providerName : undefined;
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const limit = parseOptionalNumber(req.query.limit, 'limit');
      const offset = parseOptionalNumber(req.query.offset, 'offset');
      const data = await financialAdminService.searchReceipts({
        orNumber,
        customerName,
        providerName,
        from,
        to,
        limit,
        offset,
      });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/receipts/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await orService.getOrById(req.params.id as string);
      if (!data) throw createAppError('Official receipt not found.', 404);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/receipts/:id/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const { reason } = (req.body ?? {}) as { reason?: string };
      if (!reason) throw createAppError('reason is required.', 400);
      const data = await orService.cancelOR(
        req.params.id as string,
        String(reason),
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
