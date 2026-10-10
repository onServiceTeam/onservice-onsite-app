/**
 * Phase 07 — Booking 360 admin routes.
 * Mounted at `/api/v1/admin/bookings/:id/...`
 *
 * Auth: every endpoint requires admin or super_admin.
 * Money-moving / state-changing endpoints are super_admin only.
 *
 * Audit: coverage is action-specific. The global middleware is not mounted;
 *        E37 tracks the gap. Service-written `admin_actions` remain canonical.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as bookingAdminService from '../services/booking-admin.service';
import * as bookingProofService from '../services/booking-proof.service';
import * as bookingService from '../services/booking.service';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateBookingId(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const bookingId = req.params.id;
  if (typeof bookingId !== 'string' || !UUID_REGEX.test(bookingId)) {
    next(createAppError('Booking ID must be a valid UUID.', 400));
    return;
  }
  next();
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

// ─── Detail / Timeline / Evidence / Dispute (read) ──────────────────────────

router.get(
  '/:id',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingDetail(
        req.params.id as string,
        req.user!.role,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/timeline',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingTimeline((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// D27 Phase 1 — admin visibility into the custom-quote money trail: every quote
// (with its labor/materials line items) plus every change order on a booking.
// Read-only; support/finance previously could not see why a quote-based booking
// was priced as it is or audit a disputed change order.
router.get(
  '/:id/quotes',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const bookingId = req.params.id as string;
      const [quotes, changeOrders] = await Promise.all([
        bookingService.getBookingQuotes(bookingId),
        bookingService.getChangeOrders(bookingId),
      ]);
      res.json({ success: true, data: { quotes, changeOrders } });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/evidence',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingEvidence((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// Bug UX-308 — one read-only proof-to-close view assembled from the existing
// booking, scope, checklist, media, signature, change, support, and dispute
// records. Readiness is derived on every request; this endpoint never writes a
// mutable "ready" flag or changes booking/payment state.
router.get(
  '/:id/proof-summary',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingProofService.getBookingProofSummary((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/dispute',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingDispute((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

router.get(
  '/:id/money',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await bookingAdminService.getBookingMoney((req.params.id as string));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Manual escrow release (super_admin) ────────────────────────────────────

router.post(
  '/:id/escrow/release',
  authMiddleware,
  validateBookingId,
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
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { amount, reason, supportTicketId, idempotencyKey } = req.body ?? {};
      if (typeof supportTicketId !== 'string' || !UUID_REGEX.test(supportTicketId)) {
        throw createAppError('supportTicketId must be a valid UUID.', 400);
      }
      if (typeof idempotencyKey !== 'string' || !UUID_REGEX.test(idempotencyKey)) {
        throw createAppError('idempotencyKey must be a valid UUID.', 400);
      }
      const data = await bookingAdminService.refundBookingEscrow(
        (req.params.id as string),
        Number(amount),
        String(reason ?? ''),
        req.user!.userId,
        supportTicketId,
        idempotencyKey,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Reassign provider (super_admin) ────────────────────────────────────────

router.post(
  '/:id/reassign',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const { newProviderId, reason } = req.body ?? {};
      if (!newProviderId || typeof newProviderId !== 'string') {
        throw createAppError('newProviderId is required.', 400);
      }
      if (!UUID_REGEX.test(newProviderId)) {
        throw createAppError('newProviderId must be a valid UUID.', 400);
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
  validateBookingId,
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
        hoursUntilScheduled,
        providerArrived,
        customerNoShow,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

// ─── Force complete (super_admin, very rare) ────────────────────────────────

router.post(
  '/:id/force-complete',
  authMiddleware,
  validateBookingId,
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

// ─── Audited booking support message (admin and super_admin) ────────────────

router.post(
  '/:id/message',
  authMiddleware,
  validateBookingId,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const { message } = req.body ?? {};
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw createAppError('message is required.', 400);
      }
      const data = await bookingAdminService.sendAdminMessageToBookingParticipants(
        (req.params.id as string),
        message,
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
);

export default router;
