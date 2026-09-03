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
import * as commissionControlService from '../services/commission-control.service';
import * as legacyFinancialReviewService from '../services/legacy-financial-review.service';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ─── Effective-dated commission controls ───────────────────────────────────

router.get(
  '/commission-controls',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const limit = parseOptionalNumber(req.query.limit, 'limit');
      const offset = parseOptionalNumber(req.query.offset, 'offset');
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
        throw createAppError('limit must be an integer between 1 and 200.', 400);
      }
      if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
        throw createAppError('offset must be a non-negative integer.', 400);
      }
      const data = await commissionControlService.listCommissionRates(limit, offset);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/commission-controls/preview',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const data = await commissionControlService.previewCommissionSchedule(req.body ?? {});
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/commission-controls',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const data = await commissionControlService.scheduleCommissionRate(
        req.body ?? {},
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/commission-controls/:id/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const data = await commissionControlService.cancelScheduledCommissionRate(
        req.params.id,
        req.body ?? {},
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Legacy held-booking financial review ──────────────────────────────────

router.get(
  '/legacy-reviews',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const limit = parseOptionalNumber(req.query.limit, 'limit') ?? 25;
      const offset = parseOptionalNumber(req.query.offset, 'offset') ?? 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw createAppError('limit must be an integer between 1 and 100.', 400);
      }
      if (!Number.isInteger(offset) || offset < 0) {
        throw createAppError('offset must be a non-negative integer.', 400);
      }
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const data = await legacyFinancialReviewService.listLegacyFinancialReviews(
        limit,
        offset,
        search,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/legacy-reviews/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const bookingId = req.params.id as string;
      if (!UUID_REGEX.test(bookingId)) {
        throw createAppError('Booking ID must be a valid UUID.', 400);
      }
      const data = await legacyFinancialReviewService.getLegacyFinancialReview(bookingId);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.post(
  '/legacy-reviews/:id/complete',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireSuperAdmin(req);
      const bookingId = req.params.id as string;
      if (!UUID_REGEX.test(bookingId)) {
        throw createAppError('Booking ID must be a valid UUID.', 400);
      }
      const data = await legacyFinancialReviewService.submitLegacyFinancialReview(
        bookingId,
        req.body ?? {},
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

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
      const limit = parseOptionalNumber(req.query.limit, 'limit');
      const offset = parseOptionalNumber(req.query.offset, 'offset');
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
        throw createAppError('limit must be an integer between 1 and 100.', 400);
      }
      if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
        throw createAppError('offset must be a non-negative integer.', 400);
      }
      const data = await financialAdminService.getEscrowSummary({ limit, offset });
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
  '/payments',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      requireAdmin(req);
      const retryLimit = parseOptionalNumber(req.query.retryLimit, 'retryLimit');
      const retryOffset = parseOptionalNumber(req.query.retryOffset, 'retryOffset');
      if (retryLimit !== undefined && (!Number.isInteger(retryLimit) || retryLimit < 1 || retryLimit > 100)) {
        throw createAppError('retryLimit must be an integer between 1 and 100.', 400);
      }
      if (retryOffset !== undefined && (!Number.isInteger(retryOffset) || retryOffset < 0)) {
        throw createAppError('retryOffset must be a non-negative integer.', 400);
      }
      if (req.query.intentSearch !== undefined && typeof req.query.intentSearch !== 'string') {
        throw createAppError('intentSearch must be a single identifier.', 400);
      }
      const intentSearch = typeof req.query.intentSearch === 'string' ? req.query.intentSearch.trim() : undefined;
      if (intentSearch && intentSearch.length > 255) {
        throw createAppError('intentSearch must be 255 characters or fewer.', 400);
      }
      if (req.query.retrySearch !== undefined && typeof req.query.retrySearch !== 'string') {
        throw createAppError('retrySearch must be a single identifier.', 400);
      }
      const retrySearch = typeof req.query.retrySearch === 'string' ? req.query.retrySearch.trim() : undefined;
      if (retrySearch && retrySearch.length > 255) {
        throw createAppError('retrySearch must be 255 characters or fewer.', 400);
      }
      const data = await financialAdminService.getPaymentOperationsSummary({
        retryLimit,
        retryOffset,
        intentSearch: intentSearch || undefined,
        retrySearch: retrySearch || undefined,
      });
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
      if (!UUID_REGEX.test(req.params.id as string)) {
        throw createAppError('Receipt ID must be a valid UUID.', 400);
      }
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
      if (!UUID_REGEX.test(req.params.id as string)) {
        throw createAppError('Receipt ID must be a valid UUID.', 400);
      }
      const { reason } = (req.body ?? {}) as { reason?: string };
      if (!reason || typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
        throw createAppError('reason must be 10 to 1000 characters.', 400);
      }
      const data = await orService.cancelOR(
        req.params.id as string,
        reason.trim(),
        req.user!.userId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
