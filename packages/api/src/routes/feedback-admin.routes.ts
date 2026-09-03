import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import * as feedbackAdminService from '../services/feedback-admin.service';
import * as feedbackScreenshotService from '../services/feedback-screenshot.service';

const router = Router();
const feedbackStatusSchema = z.enum(['new', 'triaged', 'done', 'dismissed']);
const feedbackAreaSchema = z.enum(['customer', 'provider', 'admin']);
const feedbackIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
const feedbackScreenshotParamsSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().max(205).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpe?g|png|webp)$/i),
}).strict();
const feedbackListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: feedbackStatusSchema.optional(),
  area: feedbackAreaSchema.optional(),
  search: z.string().trim().max(100).optional(),
}).strict();
const feedbackTriageBodySchema = z.object({
  status: feedbackStatusSchema,
  assignedAdminId: z.string().uuid().nullable().optional().default(null),
  note: z.string().trim().min(10).max(2_000),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if ((value.status === 'triaged' || value.status === 'done') && !value.assignedAdminId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assignedAdminId'],
      message: 'An owner is required for triaged or completed feedback.',
    });
  }
});

function getId(req: AuthenticatedRequest): string {
  return req.params.id as string;
}

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ query: feedbackListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as z.infer<typeof feedbackListQuerySchema>;
      const data = await feedbackAdminService.listFeedbackForAdmin({
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        area: query.area,
        search: query.search,
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
  validationMiddleware({ params: feedbackScreenshotParamsSchema }),
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
  validationMiddleware({ params: feedbackIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const entries = await feedbackAdminService.getFeedbackHistoryForAdmin(getId(req), req.user!.role);
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
  validationMiddleware({ params: feedbackIdParamsSchema }),
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
  validationMiddleware({ params: feedbackIdParamsSchema, body: feedbackTriageBodySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof feedbackTriageBodySchema>;
      const data = await feedbackAdminService.updateFeedbackTriage({
        feedbackId: getId(req),
        adminId: req.user!.userId,
        actorRole: req.user!.role,
        status: body.status,
        assignedAdminId: body.assignedAdminId,
        note: body.note,
        expectedUpdatedAt: body.expectedUpdatedAt,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
