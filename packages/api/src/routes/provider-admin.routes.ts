/**
 * Phase 05 — Provider 360 admin routes.
 * Mounted at `/api/v1/admin/providers/:id/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Write endpoints that move money or affect compliance are super_admin only.
 *
 * Audit: writes are captured globally by `auditMiddleware` (POST/PUT/PATCH/DELETE).
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as providerAdminService from '../services/provider-admin.service';

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
  '/:id/profile',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerAdminService.getProviderProfile((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/profile',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { businessName, description, serviceRadiusKm } = req.body ?? {};
      await providerAdminService.updateProviderProfile(
        (req.params.id as string),
        { businessName, description, serviceRadiusKm },
        req.user!.userId,
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Jobs ───────────────────────────────────────────────────────────────────

router.get(
  '/:id/jobs',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 20);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const data = await providerAdminService.getProviderJobs((req.params.id as string), page, pageSize, status);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Financials ─────────────────────────────────────────────────────────────

router.get(
  '/:id/financials',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerAdminService.getProviderFinancials((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/wallet/adjust',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { amount, reason } = req.body ?? {};
      const result = await providerAdminService.adjustProviderWallet(
        (req.params.id as string),
        Number(amount),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Reviews ────────────────────────────────────────────────────────────────

router.get(
  '/:id/reviews',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerAdminService.getProviderReviews((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/reviews/:reviewId/visibility',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { isVisible } = req.body ?? {};
      if (typeof isVisible !== 'boolean') {
        throw createAppError('isVisible (boolean) required.', 400);
      }
      await providerAdminService.setReviewVisibility((req.params.reviewId as string), isVisible);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/reviews/:reviewId/response',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { response } = req.body ?? {};
      if (typeof response !== 'string' || !response.trim()) {
        throw createAppError('response (non-empty string) required.', 400);
      }
      await providerAdminService.setReviewAdminResponse((req.params.reviewId as string), response.trim());
      res.json({ success: true });
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
      const data = await providerAdminService.getProviderDisputes((req.params.id as string));
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
      const data = await providerAdminService.getProviderActivity((req.params.id as string), limit);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Notes ──────────────────────────────────────────────────────────────────

router.get(
  '/:id/notes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerAdminService.listProviderNotes((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/notes',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { category, body, pinned } = req.body ?? {};
      const data = await providerAdminService.createProviderNote(
        (req.params.id as string),
        req.user!.userId,
        category ?? 'general',
        String(body ?? ''),
        Boolean(pinned),
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/notes/:noteId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { body, category, pinned } = req.body ?? {};
      const isSuperAdmin = req.user!.role === 'super_admin';
      await providerAdminService.updateProviderNote((req.params.noteId as string), req.user!.userId, isSuperAdmin, {
        body,
        category,
        pinned,
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id/notes/:noteId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const isSuperAdmin = req.user!.role === 'super_admin';
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      await providerAdminService.deleteProviderNote(
        (req.params.noteId as string),
        req.user!.userId,
        isSuperAdmin,
        reason,
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
