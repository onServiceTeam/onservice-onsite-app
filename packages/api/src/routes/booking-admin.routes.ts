/**
 * Phase 07 — Booking 360 admin routes.
 * Mounted at `/api/v1/admin/bookings/:id/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Money-moving / state-changing endpoints are super_admin only.
 *
 * Audit: writes are captured globally by `auditMiddleware` (POST/PUT/PATCH/DELETE),
 *        and each service-layer write also inserts a paired `admin_actions` row.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as bookingAdminService from '../services/booking-admin.service';

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

// ─── Detail / Timeline / Evidence / Dispute (read) ──────────────────────────

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingDetail((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/timeline',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingTimeline((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/evidence',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingEvidence((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/dispute',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingDispute((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Manual escrow release (super_admin) ────────────────────────────────────

router.post(
  '/:id/escrow/release',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { reason } = req.body ?? {};
      const data = await bookingAdminService.manualReleaseEscrow(
        (req.params.id as string),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Refund from escrow (super_admin) ───────────────────────────────────────

router.post(
  '/:id/escrow/refund',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { amount, reason } = req.body ?? {};
      const data = await bookingAdminService.refundBookingEscrow(
        (req.params.id as string),
        Number(amount),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Reassign provider (super_admin) ────────────────────────────────────────

router.post(
  '/:id/reassign',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { newProviderId, reason } = req.body ?? {};
      if (!newProviderId || typeof newProviderId !== 'string') {
        throw createAppError('newProviderId is required.', 400);
      }
      const data = await bookingAdminService.reassignBookingProvider(
        (req.params.id as string),
        newProviderId,
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Admin cancellation ─────────────────────────────────────────────────────

router.post(
  '/:id/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const {
        reason,
        hoursUntilScheduled,
        providerArrived,
        customerNoShow,
      } = req.body ?? {};
      const data = await bookingAdminService.cancelBookingAsAdmin(
        (req.params.id as string),
        String(reason ?? ''),
        req.user!.userId,
        hoursUntilScheduled !== undefined ? Number(hoursUntilScheduled) : undefined,
        providerArrived !== undefined ? Boolean(providerArrived) : undefined,
        customerNoShow !== undefined ? Boolean(customerNoShow) : undefined,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Force complete (super_admin, very rare) ────────────────────────────────

router.post(
  '/:id/force-complete',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { reason } = req.body ?? {};
      const data = await bookingAdminService.forceCompleteBooking(
        (req.params.id as string),
        String(reason ?? ''),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
