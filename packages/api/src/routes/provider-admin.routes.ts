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
import * as providerStaffService from '../services/provider-staff.service';

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
      // MED-N13 fix — accept pagination query params; service returns
      // { rows, total, page, pageSize } so admin UI can paginate.
      const page = Math.max(1, Number(req.query.page ?? 1) || 1);
      const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize ?? 50) || 50));
      const data = await providerAdminService.getProviderReviews(
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
      // MED-N13 fix — same pagination as /reviews above.
      const page = Math.max(1, Number(req.query.page ?? 1) || 1);
      const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize ?? 50) || 50));
      const data = await providerAdminService.getProviderDisputes(
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

// ─── Activity ───────────────────────────────────────────────────────────────

router.get(
  '/:id/activity',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const limit = Number(req.query.limit ?? 50);
      // PROGRESS.md follow-up — forward the caller's role so MED-N14
      // PII masking returns raw IP/UA for super_admin + dpo and
      // masked values for junior admins.
      const role = req.user?.role === 'super_admin' || req.user?.role === 'dpo'
        ? 'super_admin'
        : 'admin';
      const data = await providerAdminService.getProviderActivity(
        (req.params.id as string), limit, role,
      );
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

// ─── Staff / team members (D23) ───────────────────────────────────────────────
// Back-office review of a provider's team. A staff member must clear review here
// before the provider can assign them jobs. Their performance rolls up to the
// provider automatically (reviews.provider_id); this tab shows the per-member
// breakdown so support can spot a weak member.

async function loadStaffForProvider(
  providerId: string,
  staffId: string,
): Promise<providerStaffService.ProviderStaffRow> {
  const staff = await providerStaffService.getStaffById(staffId);
  if (!staff || staff.provider_id !== providerId) {
    throw createAppError('Staff member not found for this provider.', 404);
  }
  return staff;
}

router.get(
  '/:id/staff',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerStaffService.listStaffWithPerformance(req.params.id as string);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/staff/:staffId/review',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const decision = req.body?.decision as providerStaffService.StaffAdminDecision;
      if (!['approved', 'rejected', 'sent_back'].includes(decision)) {
        throw createAppError('decision must be one of: approved, rejected, sent_back.', 400);
      }
      await loadStaffForProvider(req.params.id as string, req.params.staffId as string);
      const updated = await providerStaffService.reviewStaff({
        staffId: req.params.staffId as string,
        adminId: req.user!.userId,
        decision,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      res.json({ success: true, data: providerStaffService.formatProviderStaff(updated) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/staff/:staffId/suspend',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const suspend = req.body?.suspend !== false; // default: suspend; pass { suspend: false } to reactivate
      await loadStaffForProvider(req.params.id as string, req.params.staffId as string);
      const updated = await providerStaffService.setStaffSuspension({
        staffId: req.params.staffId as string,
        adminId: req.user!.userId,
        suspend,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      res.json({ success: true, data: providerStaffService.formatProviderStaff(updated) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
