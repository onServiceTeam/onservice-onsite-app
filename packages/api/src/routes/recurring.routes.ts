import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import { createRecurringSchema } from '../validators/recurring.validators';
import * as recurringService from '../services/recurring.service';
// E02 / D22 (2026-05-02) — auto-charge management endpoints.
import * as autoChargeService from '../services/recurring-auto-charge.service';

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) {
    throw createAppError('Recurring booking ID is required.', 400);
  }
  return id;
}

const router = Router();

// Phase 14 Dispatch 05 — Bug 208 + Bug 1132.
// Switched to validationMiddleware(createRecurringSchema) so the
// request body is parsed by Zod with `.strict()`. Unknown keys
// (including `servicePrice`) are rejected; the server resolves the
// canonical price from service_subcategories.base_price.
router.post(
  '/',
  authMiddleware,
  validationMiddleware(createRecurringSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const body = req.body as {
        providerId?: string;
        categoryId: string;
        subcategoryId: string;
        originalBookingId?: string;
        frequency: 'weekly' | 'bi_weekly' | 'monthly';
        preferredDay: number;
        preferredTime: string;
        address: string;
        barangay: string;
        city: string;
        province: string;
        latitude?: number;
        longitude?: number;
      };

      const rb = await recurringService.createRecurringBooking({
        customerId: userId,
        providerId: body.providerId,
        categoryId: body.categoryId,
        subcategoryId: body.subcategoryId,
        originalBookingId: body.originalBookingId,
        frequency: body.frequency,
        preferredDay: body.preferredDay,
        preferredTime: body.preferredTime,
        address: body.address,
        barangay: body.barangay,
        city: body.city,
        province: body.province,
        latitude: body.latitude,
        longitude: body.longitude,
      });

      res.status(201).json({
        success: true,
        data: recurringService.formatRecurringBooking(rb),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const result = await recurringService.getCustomerRecurringBookings(userId, page, pageSize);

      res.json({
        success: true,
        data: result.items.map(recurringService.formatRecurringBooking),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Canonical recurring price shown before the customer creates a series.
// This endpoint resolves catalog price and the live service-fee setting on
// the server, so setup never reuses a stale total from an older booking.
router.get(
  '/preview/:subcategoryId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subcategoryId = req.params.subcategoryId;
      if (typeof subcategoryId !== 'string' || !subcategoryId) {
        throw createAppError('Subcategory ID is required.', 400);
      }
      const preview = await recurringService.getRecurringPricePreview(subcategoryId);
      res.json({ success: true, data: preview });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      const rb = await recurringService.getRecurringBooking(recurringId, userId);

      res.json({
        success: true,
        data: recurringService.formatRecurringBooking(rb),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/instances',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      await recurringService.getRecurringBooking(recurringId, userId);

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const result = await recurringService.getRecurringInstances(recurringId, page, pageSize);

      res.json({
        success: true,
        data: result.items.map(recurringService.formatRecurringInstance),
        pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/pause',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      const rb = await recurringService.pauseRecurringBooking(recurringId, userId);

      res.json({
        success: true,
        data: recurringService.formatRecurringBooking(rb),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/resume',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      const rb = await recurringService.resumeRecurringBooking(recurringId, userId);

      res.json({
        success: true,
        data: recurringService.formatRecurringBooking(rb),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      const { reason } = req.body as { reason?: string };

      const rb = await recurringService.cancelRecurringBooking(recurringId, userId, reason);

      res.json({
        success: true,
        data: recurringService.formatRecurringBooking(rb),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/skip',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      const { skipDate } = req.body as { skipDate: string };

      if (!skipDate) {
        throw createAppError('Skip date is required.', 400);
      }

      const rb = await recurringService.skipNextInstance(recurringId, userId, skipDate);

      res.json({
        success: true,
        data: recurringService.formatRecurringBooking(rb),
      });
    } catch (err) {
      next(err);
    }
  },
);

// E02 / D22 — Auto-charge payment method management.
//
// PUT /:id/auto-charge — deliberately retained as an explicit disabled
// boundary. E20 blocks capture/storage until the money path is rebuilt.
router.put(
  '/:id/auto-charge',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // E20 containment: the underlying amount, lifecycle, consent, provider
      // eligibility, and reconciliation path is not launch-safe. Keep the
      // endpoint present so clients receive an explicit response, but never
      // accept or store a reusable token until that remediation lands.
      throw createAppError(
        'Recurring automatic payments are not available. Each generated booking must be paid manually.',
        503,
      );
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /:id/auto-charge — clear the stored payment method. Future
// scheduler runs fall back to manual payment.
router.delete(
  '/:id/auto-charge',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      await autoChargeService.clearAutoChargePaymentMethod(recurringId, userId);
      res.json({ success: true, message: 'Auto-charge payment method cleared.' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/auto-charge/attempts — recent auto-charge attempt history.
router.get(
  '/:id/auto-charge/attempts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      // Authorization: only the owner can read their own history.
      await recurringService.getRecurringBooking(recurringId, userId);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const attempts = await autoChargeService.listAttempts(recurringId, limit);
      res.json({ success: true, data: attempts });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
