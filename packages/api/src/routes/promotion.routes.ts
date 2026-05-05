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

// BUG-PHASE153-01 fix — promotion routes manually parsed req.body
// without server-side length validation. Promotions surface on the
// customer home banner + provider dashboard; an admin (or compromised
// admin token) could submit a 100,000-char subtitle that the TEXT
// column accepts but every customer's home screen tries to render.
// Plus ctaLink is a URL stored as VARCHAR(500); without validation
// you'd get a raw SQL constraint error instead of a friendly 400.
//
// Caps mirror the column types from migration 044_promotions.sql:
//   title VARCHAR(200), subtitle TEXT, image_url TEXT, badge VARCHAR(30),
//   cta_text VARCHAR(50), cta_link VARCHAR(500),
//   target_audience VARCHAR(30) CHECK IN ('all','new_customers','returning','providers')
// For TEXT columns (subtitle, image_url) we add explicit caps because
// Postgres has no DB-side limit for TEXT.
//
// Same defense-in-depth pattern as Phase 152 (portfolio + cert caps).
const PROMO_TITLE_MAX = 200;
const PROMO_SUBTITLE_MAX = 1000;
const PROMO_IMAGE_URL_MAX = 500;
const PROMO_BADGE_MAX = 30;
const PROMO_CTA_TEXT_MAX = 50;
const PROMO_CTA_LINK_MAX = 500;
const PROMO_TARGET_AUDIENCES = new Set([
  'all', 'new_customers', 'returning', 'providers',
]);

function validatePromoText(value: unknown, field: string, max: number, optional = true): void {
  if (value === undefined || value === null) {
    if (!optional) throw createAppError(`${field} is required.`, 400);
    return;
  }
  if (typeof value !== 'string') throw createAppError(`${field} must be a string.`, 400);
  if (value.length > max) {
    throw createAppError(`${field} must be ≤ ${max} characters.`, 400);
  }
}

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
      // BUG-PHASE153-01 fix — explicit length validation matches the
      // column types from migration 044_promotions.sql.
      validatePromoText(title, 'title', PROMO_TITLE_MAX, false);
      validatePromoText(subtitle, 'subtitle', PROMO_SUBTITLE_MAX);
      validatePromoText(imageUrl, 'imageUrl', PROMO_IMAGE_URL_MAX);
      validatePromoText(badge, 'badge', PROMO_BADGE_MAX);
      validatePromoText(ctaText, 'ctaText', PROMO_CTA_TEXT_MAX);
      validatePromoText(ctaLink, 'ctaLink', PROMO_CTA_LINK_MAX);
      if (targetAudience !== undefined && !PROMO_TARGET_AUDIENCES.has(targetAudience)) {
        throw createAppError(
          `targetAudience must be one of: ${[...PROMO_TARGET_AUDIENCES].join(', ')}.`,
          400,
        );
      }
      if (displayOrder !== undefined && (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder))) {
        throw createAppError('displayOrder must be an integer.', 400);
      }
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
      const body = req.body as Record<string, unknown>;
      // BUG-PHASE153-01 fix — same caps on the PUT path. Each field
      // is optional on update; the validator just enforces shape and
      // length for any field that IS supplied.
      validatePromoText(body['title'], 'title', PROMO_TITLE_MAX);
      validatePromoText(body['subtitle'], 'subtitle', PROMO_SUBTITLE_MAX);
      validatePromoText(body['imageUrl'], 'imageUrl', PROMO_IMAGE_URL_MAX);
      validatePromoText(body['badge'], 'badge', PROMO_BADGE_MAX);
      validatePromoText(body['ctaText'], 'ctaText', PROMO_CTA_TEXT_MAX);
      validatePromoText(body['ctaLink'], 'ctaLink', PROMO_CTA_LINK_MAX);
      if (body['targetAudience'] !== undefined && (typeof body['targetAudience'] !== 'string' || !PROMO_TARGET_AUDIENCES.has(body['targetAudience'] as string))) {
        throw createAppError(
          `targetAudience must be one of: ${[...PROMO_TARGET_AUDIENCES].join(', ')}.`,
          400,
        );
      }
      // MED-N151 fix — pass actor for audit row.
      const promo = await promotionService.updatePromotion(id, {
        ...body,
        updatedByAdminId: req.user!.userId,
      });
      res.json({ success: true, data: promotionService.formatPromotion(promo) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  authMiddleware,
  // MED-N168 fix — promotion DELETE raised to super_admin only.
  // Junior admin can still create/update via POST/PUT (audited per
  // MED-N150/N151), but deletion is destructive and is gated up.
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'] as string;
      // MED-N150 fix — pass actor for audit row.
      await promotionService.deletePromotion(id, req.user!.userId);
      res.json({ success: true, data: { message: 'Promotion deleted.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
