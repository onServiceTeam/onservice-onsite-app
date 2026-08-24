import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  fileDisputeSchema,
  providerDisputeResponseSchema,
  resolveDisputeSchema,
  escalateDisputeSchema,
  assignDisputeSchema,
} from '../validators/dispute.validators';
import * as disputeService from '../services/dispute.service';
import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';
import { assertDisputePartySettlementEnabled } from '../services/dispute-party-settlement-hold.service';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

router.post(
  '/',
  authMiddleware,
  validationMiddleware(fileDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const dispute = await disputeService.fileDispute(
        req.body.bookingId,
        req.user!.userId,
        req.body,
      );
      const evidence = await disputeService.getDisputeEvidence(dispute.id);
      res.status(201).json({
        success: true,
        data: {
          ...disputeService.formatDispute(dispute),
          evidence: evidence.map(disputeService.formatEvidence),
        },
      });
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
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const bookingId = typeof req.query.bookingId === 'string' ? req.query.bookingId : undefined;

      const { disputes, total } = await disputeService.listUserDisputes(
        req.user!.userId,
        { status, bookingId, page, pageSize },
      );

      res.json({
        success: true,
        data: disputes.map(disputeService.formatDispute),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Dispute ID is required.', 400);

      const dispute = await disputeService.getDisputeById(id);

      const userId = req.user!.userId;
      const role = req.user!.role;
      const isAdmin = role === 'admin' || role === 'super_admin';
      if (!isAdmin && dispute.filed_by !== userId) {
        const bookingRow = await db.query<{ provider_id: string | null }>(
          `SELECT b.provider_id FROM bookings b WHERE b.id = $1`,
          [dispute.booking_id],
        );
        const providerRow = bookingRow.rows[0]?.provider_id
          ? await db.query<{ user_id: string }>(
              `SELECT user_id FROM providers WHERE id = $1`,
              [bookingRow.rows[0].provider_id],
            )
          : null;
        const isAssignedProvider = providerRow?.rows[0]?.user_id === userId;
        if (!isAssignedProvider) {
          throw createAppError('You do not have permission to view this dispute.', 403);
        }
      }

      const evidence = await disputeService.getDisputeEvidence(id);

      res.json({
        success: true,
        data: {
          ...disputeService.formatDispute(dispute),
          evidence: evidence.map(disputeService.formatEvidence),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/provider-response',
  authMiddleware,
  validationMiddleware(providerDisputeResponseSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Dispute ID is required.', 400);
      if (req.body.action !== 'contest') assertDisputePartySettlementEnabled();

      const dispute = await disputeService.addProviderResponse(
        id,
        req.user!.userId,
        req.body.response,
        req.body.action,
        req.body.partialOfferAmount,
      );

      res.json({ success: true, data: disputeService.formatDispute(dispute) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/accept-offer',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Dispute ID is required.', 400);
      assertDisputePartySettlementEnabled();

      const dispute = await disputeService.acceptPartialOffer(id, req.user!.userId);
      res.json({ success: true, data: disputeService.formatDispute(dispute) });
    } catch (error) {
      next(error);
    }
  },
);

// MED-N160 fix: dispute resolution / escalation / assignment are
// money-affecting actions (resolve writes refund or escrow-release;
// escalate moves the dispute up the financial-impact ladder; assign
// hands the case to a specific reviewer). These should require
// super_admin rather than the generic admin role. Junior admins keep
// read access (GET /, GET /:id) but cannot mutate dispute state.
router.put(
  '/:id/resolve',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware(resolveDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Dispute ID is required.', 400);

      const dispute = await disputeService.resolveDispute(id, req.user!.userId, req.body);
      res.json({ success: true, data: disputeService.formatDispute(dispute) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/escalate',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware(escalateDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Dispute ID is required.', 400);

      const dispute = await disputeService.escalateDispute(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: disputeService.formatDispute(dispute) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id/assign',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware(assignDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'];
      if (typeof id !== 'string' || !id) throw createAppError('Dispute ID is required.', 400);

      const dispute = await disputeService.assignDispute(id, req.user!.userId, req.body.assigneeId);
      res.json({ success: true, data: disputeService.formatDispute(dispute) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const tier = req.query.tier ? Number(req.query.tier) : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const { disputes, total } = await disputeService.listDisputes({ status, tier, search, page, pageSize });

      res.json({
        success: true,
        data: disputes.map(disputeService.formatDispute),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
