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

router.get(
  '/data-export/:id/download-link',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const exportId = req.params.id;
      if (typeof exportId !== 'string' || !exportId) {
        res.status(400).json({ success: false, error: { message: 'Export ID is required.', statusCode: 400 } });
        return;
      }
      const link = await dataManagementService.createDataExportDownloadLink(req.user!.userId, exportId);
      res.json({ success: true, data: link });
    } catch (error) {
      next(error);
    }
  },
);

// The authenticated endpoint above mints this five-minute HMAC bearer link.
// That lets native and browser clients hand the download to the operating
// system without putting a long-lived account token in the URL.
router.get(
  '/data-export/:id/download',
  async (req, res: Response, next: NextFunction) => {
    try {
      const exportId = req.params.id;
      const expires = Number(req.query.expires);
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      if (typeof exportId !== 'string' || !exportId || !token) {
        res.status(400).json({ success: false, error: { message: 'Invalid download link.', statusCode: 400 } });
        return;
      }
      const { stream, filename } = await dataManagementService.getDataExportDownload(exportId, expires, token);
      res.setHeader('Content-Type', stream.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      if (stream.contentLength !== undefined) res.setHeader('Content-Length', String(stream.contentLength));
      stream.body.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

// --- Account Deletion (30-day cooling period per DPA) ---

// BUG-PHASE156-01 fix — pre-fix the deletion `reason` had no
// server cap. Column is TEXT (account_deletion_requests.reason —
// migration 025_data_management.sql), so Postgres accepted any
// length. Same defense-in-depth pattern as Phase 152-155.
const ACCOUNT_DELETION_REASON_MAX = 1000;

router.post(
  '/deletion',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : undefined;
      // BUG-PHASE156-01 fix — reject unbounded reason strings.
      if (reason !== undefined && reason.length > ACCOUNT_DELETION_REASON_MAX) {
        const { createAppError } = await import('../middleware/error.middleware');
        throw createAppError(
          `reason must be ≤ ${ACCOUNT_DELETION_REASON_MAX} characters.`,
          400,
        );
      }
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
