import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as recurringService from '../services/recurring.service';

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) {
    throw createAppError('Recurring booking ID is required.', 400);
  }
  return id;
}

const router = Router();

router.post(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const {
        providerId, categoryId, subcategoryId, originalBookingId,
        frequency, preferredDay, preferredTime,
        address, barangay, city, province, latitude, longitude,
        servicePrice,
      } = req.body as {
        providerId?: string;
        categoryId: string;
        subcategoryId?: string;
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
        servicePrice: number;
      };

      if (!categoryId || !frequency || preferredDay === undefined || !preferredTime || !address || !barangay || !city || !province || !servicePrice) {
        throw createAppError('Missing required fields.', 400);
      }

      if (!['weekly', 'bi_weekly', 'monthly'].includes(frequency)) {
        throw createAppError('Invalid frequency. Must be weekly, bi_weekly, or monthly.', 400);
      }

      if (typeof preferredDay !== 'number' || preferredDay < 0 || preferredDay > 6) {
        throw createAppError('Invalid preferred day. Must be 0 (Sunday) through 6 (Saturday).', 400);
      }

      const rb = await recurringService.createRecurringBooking({
        customerId: userId,
        providerId,
        categoryId,
        subcategoryId,
        originalBookingId,
        frequency,
        preferredDay,
        preferredTime,
        address,
        barangay,
        city,
        province,
        latitude,
        longitude,
        servicePrice,
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

export default router;
