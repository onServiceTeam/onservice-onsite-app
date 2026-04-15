import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { redeemReferralSchema } from '../validators/referral.validators';
import * as referralService from '../services/referral.service';

const router = Router();

router.get(
  '/my-code',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const code = await referralService.getOrCreateReferralCode(req.user!.userId);
      res.json({ success: true, data: referralService.formatReferralCode(code) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/redeem',
  authMiddleware,
  validationMiddleware(redeemReferralSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const redemption = await referralService.redeemReferralCode(req.user!.userId, req.body.code);
      res.status(201).json({ success: true, data: referralService.formatRedemption(redemption) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/my-referrals',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const { code, redemptions, total } = await referralService.getMyReferrals(
        req.user!.userId, page, pageSize,
      );

      res.json({
        success: true,
        data: {
          code: code ? referralService.formatReferralCode(code) : null,
          redemptions: redemptions.map(referralService.formatRedemption),
        },
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
