import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as feedbackAdminService from '../services/feedback-admin.service';
import * as feedbackScreenshotService from '../services/feedback-screenshot.service';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    throw createAppError('Feedback ID must be a valid UUID.', 400);
  }
  return id;
}

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await feedbackAdminService.listFeedbackForAdmin({
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 25),
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        area: typeof req.query.area === 'string' ? req.query.area : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        actorRole: req.user!.role,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/screenshots/:filename',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const stream = await feedbackScreenshotService.getFeedbackScreenshotForAdmin(
        getId(req),
        req.params.filename,
      );
      res.setHeader('Content-Type', stream.contentType);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (stream.contentLength != null) res.setHeader('Content-Length', String(stream.contentLength));
      stream.body.on('error', (error: Error) => next(error));
      stream.body.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/history',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const entries = await feedbackAdminService.getFeedbackHistoryForAdmin(getId(req));
      res.json({ success: true, data: { entries } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await feedbackAdminService.getFeedbackForAdmin(getId(req), req.user!.role);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/triage',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await feedbackAdminService.updateFeedbackTriage({
        feedbackId: getId(req),
        adminId: req.user!.userId,
        actorRole: req.user!.role,
        status: String(req.body?.status ?? ''),
        assignedAdminId: req.body?.assignedAdminId ? String(req.body.assignedAdminId) : null,
        note: String(req.body?.note ?? ''),
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
