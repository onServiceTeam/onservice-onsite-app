import { Router, type Request, type Response, type NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as promotionService from '../services/promotion.service';

const router = Router();

router.get(
  '/active',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const audience = (typeof req.query.audience === 'string' ? req.query.audience : 'all');
      const promotions = await promotionService.getActivePromotions(audience);
      res.json({ success: true, data: promotions.map(promotionService.formatPromotion) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
      const { rows, total } = await promotionService.getAllPromotions(page, pageSize);
      res.json({
        success: true,
        data: rows.map(promotionService.formatPromotion),
        meta: { page, pageSize, total },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, subtitle, imageUrl, badge, ctaText, ctaLink, targetAudience, startDate, endDate, displayOrder } = req.body as {
        title: string; subtitle?: string; imageUrl?: string; badge?: string;
        ctaText?: string; ctaLink?: string; targetAudience?: string;
        startDate?: string; endDate?: string; displayOrder?: number;
      };
      if (!title || typeof title !== 'string') throw createAppError('title is required.', 400);
      const promo = await promotionService.createPromotion({
        title, subtitle, imageUrl, badge, ctaText, ctaLink,
        targetAudience, startDate, endDate, displayOrder,
        createdBy: req.user!.userId,
      });
      res.status(201).json({ success: true, data: promotionService.formatPromotion(promo) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'] as string;
      const promo = await promotionService.updatePromotion(id, req.body as Record<string, unknown>);
      res.json({ success: true, data: promotionService.formatPromotion(promo) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'] as string;
      await promotionService.deletePromotion(id);
      res.json({ success: true, data: { message: 'Promotion deleted.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
