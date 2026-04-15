import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import * as dataManagementService from '../services/data-management.service';

const router = Router();

// --- Data Export (RA 10173 right to data portability) ---

router.post(
  '/data-export',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const format = req.body.format === 'csv' ? 'csv' as const : 'json' as const;
      const exportReq = await dataManagementService.requestDataExport(req.user!.userId, format);
      res.status(201).json({
        success: true,
        data: dataManagementService.formatDataExport(exportReq),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/data-export',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const exports = await dataManagementService.getDataExportStatus(req.user!.userId);
      res.json({
        success: true,
        data: exports.map(dataManagementService.formatDataExport),
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- Account Deletion (30-day cooling period per DPA) ---

router.post(
  '/deletion',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : undefined;
      const request = await dataManagementService.requestAccountDeletion(
        req.user!.userId,
        reason,
      );
      res.status(201).json({
        success: true,
        data: dataManagementService.formatAccountDeletion(request),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/deletion/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await dataManagementService.cancelAccountDeletion(req.user!.userId);
      res.json({ success: true, message: 'Account deletion cancelled.' });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deletion/status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const status = await dataManagementService.getAccountDeletionStatus(req.user!.userId);
      res.json({
        success: true,
        data: status ? dataManagementService.formatAccountDeletion(status) : null,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
