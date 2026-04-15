import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { sendTipSchema } from '../validators/tip.validators';
import * as tipService from '../services/tip.service';
import { createAppError } from '../middleware/error.middleware';

const router = Router();

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
