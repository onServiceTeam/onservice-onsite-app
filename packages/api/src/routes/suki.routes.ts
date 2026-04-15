import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { redeemPointsSchema } from '../validators/suki.validators';
import * as sukiService from '../services/suki.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

const router = Router();

router.get(
  '/memberships',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const { memberships, total } = await sukiService.getCustomerMemberships(
        req.user!.userId, page, pageSize,
      );

      res.json({
        success: true,
        data: memberships.map(sukiService.formatMembership),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/memberships/:id/rewards',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Membership ID is required.', 400);

      interface MembershipOwnerRow { customer_id: string }
      const membership = await db.query<MembershipOwnerRow>(
        `SELECT customer_id FROM suki_memberships WHERE id = $1`,
        [id],
      );
      if (membership.rows.length === 0) throw createAppError('Membership not found.', 404);
      if (membership.rows[0]!.customer_id !== req.user!.userId) {
        throw createAppError('You do not have access to this membership.', 403);
      }

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

      const { rewards, total } = await sukiService.getMembershipRewards(id, page, pageSize);

      res.json({
        success: true,
        data: rewards.map(sukiService.formatReward),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/redeem',
  authMiddleware,
  validationMiddleware(redeemPointsSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await sukiService.redeemPoints(
        req.user!.userId,
        req.body.membershipId,
        req.body.points,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/tiers',
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tiers = sukiService.getSukiTiers();
      const tiersArray = Object.entries(tiers).map(([name, config]) => ({
        name,
        minBookings: config.minBookings,
        pointsPerBooking: config.pointsPerPeso,
        discount: config.discount,
      }));
      res.json({ success: true, data: tiersArray });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
