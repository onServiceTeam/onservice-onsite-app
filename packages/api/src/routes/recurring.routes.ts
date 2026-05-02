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
// PUT /:id/auto-charge — capture or replace the stored PayMongo
// payment method. Body: { paymentMethodId, paymentMethodLabel }.
// Resets the consecutive-failures counter and clears any prior
// suspension.
router.put(
  '/:id/auto-charge',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const recurringId = getParamId(req);
      const userId = req.user!.userId;
      const { paymentMethodId, paymentMethodLabel } = req.body as {
        paymentMethodId?: string;
        paymentMethodLabel?: string;
      };
      if (typeof paymentMethodId !== 'string' || !paymentMethodId.trim()) {
        throw createAppError('paymentMethodId is required.', 400);
      }
      if (typeof paymentMethodLabel !== 'string' || !paymentMethodLabel.trim()) {
        throw createAppError('paymentMethodLabel is required.', 400);
      }
      await autoChargeService.setAutoChargePaymentMethod(
        recurringId, userId, paymentMethodId.trim(), paymentMethodLabel.trim(),
      );
      res.json({ success: true, message: 'Auto-charge payment method saved.' });
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
