import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
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

      const { disputes, total } = await disputeService.listUserDisputes(
        req.user!.userId,
        { status, page, pageSize },
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

      const dispute = await disputeService.acceptPartialOffer(id, req.user!.userId);
      res.json({ success: true, data: disputeService.formatDispute(dispute) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id/resolve',
  authMiddleware,
  validationMiddleware(resolveDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
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
  validationMiddleware(escalateDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
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
  validationMiddleware(assignDisputeSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
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
