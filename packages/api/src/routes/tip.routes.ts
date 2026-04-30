import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { sendTipSchema } from '../validators/tip.validators';
import * as tipService from '../services/tip.service';
import { getSettingNumber } from '../services/settings.service';
import { createAppError } from '../middleware/error.middleware';

const router = Router();

// Phase 14 Dispatch 05 — Bug 417.
// Public endpoint exposing the current tip min/max from platform_settings.
// Mobile checkout/tip screens fetch this instead of computing the cap
// from the booking's servicePrice (the original Bug 417: "tip cap is
// service price (100%)").
router.get(
  '/limits',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const maxCents = await getSettingNumber('tip_max_amount_cents');
      res.json({
        success: true,
        data: {
          minCents: 100, // ₱1.00 — implicit floor (positive, integer)
          maxCents: Number.isFinite(maxCents) && maxCents > 0 ? maxCents : 500_000,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  validationMiddleware(sendTipSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tip = await tipService.sendTip(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: tipService.formatTip(tip) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/my',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const role = req.user!.role === 'provider' ? 'provider' : 'customer';

      const { tips, total } = await tipService.getMyTips(req.user!.userId, role, page, pageSize);

      res.json({
        success: true,
        data: tips.map(tipService.formatTip),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/booking/:bookingId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const bookingId = req.params['bookingId'];
      if (typeof bookingId !== 'string' || !bookingId) throw createAppError('Booking ID is required.', 400);

      const tips = await tipService.getTipsByBooking(bookingId);
      res.json({ success: true, data: tips.map(tipService.formatTip) });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
