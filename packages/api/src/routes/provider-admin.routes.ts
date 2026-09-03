/**
 * Phase 05 — Provider 360 admin routes.
 * Mounted at `/api/v1/admin/providers/:id/...`
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
import * as providerAdminService from '../services/provider-admin.service';
import * as providerStaffService from '../services/provider-staff.service';
import * as kycDocumentService from '../services/kyc-document.service';
import { validationMiddleware } from '../middleware/validation.middleware';
import { providerCertificationReviewSchema } from '../validators/provider.validators';
import { ALL_BOOKING_STATUSES } from '../types/booking.types';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuidParam(name: string, label: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const value = req.params[name];
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      next(createAppError(`${label} must be a valid UUID.`, 400));
      return;
    }
    next();
  };
}

const validateProviderId = validateUuidParam('id', 'Provider ID');
const validateReviewId = validateUuidParam('reviewId', 'Review ID');
const validateNoteId = validateUuidParam('noteId', 'Note ID');
const validateStaffId = validateUuidParam('staffId', 'Staff ID');
const validateCertificationId = validateUuidParam('certId', 'Certification ID');

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
  '/:id/profile',
  authMiddleware,
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      // D25: pass the caller's role so the service masks contact for non-super_admin.
      const data = await providerAdminService.getProviderProfile(
        (req.params.id as string),
        req.user!.role,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// D25 — audit-logged reveal of a provider's raw phone + email. Any admin may
// call it (the reveal is the recorded action).
router.post(
  '/:id/reveal-contact',
  authMiddleware,
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerAdminService.revealProviderContact(
        (req.params.id as string),
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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const data = await providerAdminService.revokeProviderSessions(
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

router.patch(
  '/:id/profile',
  authMiddleware,
  validateProviderId,
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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = positiveIntegerQuery(req.query.page, 'page', 1, 100_000);
      const pageSize = positiveIntegerQuery(req.query.pageSize, 'pageSize', 20, 100);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (status && !ALL_BOOKING_STATUSES.includes(status as never)) {
        throw createAppError('status must be a known booking status.', 400);
      }
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
  validateProviderId,
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
  validateProviderId,
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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      // MED-N13 fix — accept pagination query params; service returns
      // { rows, total, page, pageSize } so admin UI can paginate.
      let reviewId: string | undefined;
      if (req.query.reviewId !== undefined) {
        if (typeof req.query.reviewId !== 'string' || !UUID_REGEX.test(req.query.reviewId)) {
          throw createAppError('reviewId must be a valid UUID.', 400);
        }
        reviewId = req.query.reviewId;
      }
      const page = reviewId ? 1 : positiveIntegerQuery(req.query.page, 'page', 1, 100_000);
      const pageSize = reviewId ? 1 : positiveIntegerQuery(req.query.pageSize, 'pageSize', 50, 200);
      const data = await providerAdminService.getProviderReviews(
        req.params.id as string,
        page,
        pageSize,
        reviewId,
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
  validateProviderId,
  validateReviewId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { isVisible, reason } = req.body ?? {};
      if (typeof isVisible !== 'boolean') {
        throw createAppError('isVisible (boolean) required.', 400);
      }
      await providerAdminService.setReviewVisibility(
        req.params.id as string,
        req.params.reviewId as string,
        isVisible,
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/reviews/:reviewId/response',
  authMiddleware,
  validateProviderId,
  validateReviewId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { response, reason } = req.body ?? {};
      if (typeof response !== 'string' || !response.trim()) {
        throw createAppError('response (non-empty string) required.', 400);
      }
      await providerAdminService.setReviewAdminResponse(
        req.params.id as string,
        req.params.reviewId as string,
        response,
        String(reason ?? ''),
        req.user!.userId,
      );
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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      // MED-N13 fix — same pagination as /reviews above.
      const page = positiveIntegerQuery(req.query.page, 'page', 1, 100_000);
      const pageSize = positiveIntegerQuery(req.query.pageSize, 'pageSize', 50, 200);
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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const limit = positiveIntegerQuery(req.query.limit, 'limit', 50, 200);
      // Forward the authorized operations role so super_admin receives the
      // intended forensic view while plain admin remains masked. DPO is
      // rejected by requireAdmin above and is never upgraded here.
      const role = req.user?.role === 'super_admin' ? 'super_admin' : 'admin';
      const adminActionId = req.query.adminActionId;
      if (
        adminActionId !== undefined
        && (typeof adminActionId !== 'string' || !UUID_REGEX.test(adminActionId))
      ) {
        throw createAppError('adminActionId must be a valid UUID.', 400);
      }
      const data = await providerAdminService.getProviderActivity(
        req.params.id as string,
        adminActionId ? 1 : limit,
        role,
        adminActionId,
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
  validateProviderId,
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
  validateProviderId,
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
  validateProviderId,
  validateNoteId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { body, category, pinned } = req.body ?? {};
      const isSuperAdmin = req.user!.role === 'super_admin';
      await providerAdminService.updateProviderNote(
        req.params.id as string,
        req.params.noteId as string,
        req.user!.userId,
        isSuperAdmin,
        { body, category, pinned },
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id/notes/:noteId',
  authMiddleware,
  validateProviderId,
  validateNoteId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const isSuperAdmin = req.user!.role === 'super_admin';
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      await providerAdminService.deleteProviderNote(
        req.params.id as string,
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
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerStaffService.listStaffWithPerformance(
        req.params.id as string,
        req.user!.role,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/staff/:staffId/review',
  authMiddleware,
  validateProviderId,
  validateStaffId,
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
      res.json({
        success: true,
        data: providerStaffService.formatProviderStaffForAdmin(updated, req.user!.role),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/staff/:staffId/suspend',
  authMiddleware,
  validateProviderId,
  validateStaffId,
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
      res.json({
        success: true,
        data: providerStaffService.formatProviderStaffForAdmin(updated, req.user!.role),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Provider certifications ────────────────────────────────────────────────
// Credential documents are private uploads. Admins review them through the
// authenticated proxy below, then explicitly add or remove verification.

router.post(
  '/:id/certifications/:certId/review',
  authMiddleware,
  validateProviderId,
  validateCertificationId,
  validationMiddleware(providerCertificationReviewSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await providerAdminService.reviewProviderCertification({
        providerId: req.params.id as string,
        certId: req.params.certId as string,
        adminId: req.user!.userId,
        isVerified: req.body.isVerified,
        reason: req.body.reason,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/certifications/:certId/document',
  authMiddleware,
  validateProviderId,
  validateCertificationId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const stream = await providerAdminService.getProviderCertificationDocumentStream(
        req.params.id as string,
        req.params.certId as string,
      );
      res.setHeader('Content-Type', stream.contentType);
      res.setHeader('Cache-Control', 'private, no-store');
      if (stream.contentLength != null) res.setHeader('Content-Length', String(stream.contentLength));
      stream.body.on('error', (err: Error) => next(err));
      stream.body.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

// §35a — stream a provider's KYC document (gov ID, NBI, selfie) for admin
// review. Read server-side from the private KYC bucket; never expose the raw
// storage URL. Admin/super_admin only.
router.get(
  '/:id/kyc/:docType',
  authMiddleware,
  validateProviderId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const docType = req.params.docType;
      if (!kycDocumentService.isKycDocType(docType)) {
        throw createAppError('Invalid document type.', 400);
      }
      // §35a (presigned option) — ?mode=link returns a short-lived signed URL.
      if (req.query.mode === 'link') {
        const link = await kycDocumentService.getProviderKycPresignedUrl({
          providerId: req.params.id as string,
          docType,
          requesterUserId: req.user!.userId,
          requesterRole: req.user!.role,
        });
        if (link) { res.json({ success: true, data: link }); return; }
      }
      const stream = await kycDocumentService.getProviderKycDocumentStream({
        providerId: req.params.id as string,
        docType,
        requesterUserId: req.user!.userId,
        requesterRole: req.user!.role,
      });
      res.setHeader('Content-Type', stream.contentType);
      res.setHeader('Cache-Control', 'private, no-store');
      if (stream.contentLength != null) res.setHeader('Content-Length', String(stream.contentLength));
      stream.body.on('error', (err: Error) => next(err));
      stream.body.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
