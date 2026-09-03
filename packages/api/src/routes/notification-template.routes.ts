import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  createTemplateSchema,
  deleteTemplateSchema,
  updateTemplateSchema,
} from '../validators/notification-template.validators';
import * as templateService from '../services/notification-template.service';
import { createAppError } from '../middleware/error.middleware';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireTemplateId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw createAppError('Template ID must be a valid UUID.', 400);
  }
  return value;
}

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

// Notification-template mutations publish customer/provider-facing copy for
// connected workflows. Keep the whole lifecycle under super-admin oversight;
// ordinary admins retain read-only support visibility.
function requireSuperAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'super_admin') {
    throw createAppError('Super admin access required.', 403);
  }
}

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

      const { templates, total } = await templateService.listTemplates({
        type, channel, isActive, page, pageSize,
      });

      res.json({
        success: true,
        data: templates.map(templateService.formatTemplate),
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
      requireAdmin(req);
      const id = requireTemplateId(req.params['id']);

      const template = await templateService.getTemplateById(id);
      res.json({ success: true, data: templateService.formatTemplate(template) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  validationMiddleware(createTemplateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const template = await templateService.createTemplate(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: templateService.formatTemplate(template) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id',
  authMiddleware,
  validationMiddleware(updateTemplateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const id = requireTemplateId(req.params['id']);

      const template = await templateService.updateTemplate(id, req.user!.userId, req.body);
      res.json({ success: true, data: templateService.formatTemplate(template) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  authMiddleware,
  validationMiddleware(deleteTemplateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req); // SEC-035
      const id = requireTemplateId(req.params['id']);

      // MED-N142 fix — pass the actor's userId so the service can
      // record the admin_actions audit row.
      await templateService.deleteTemplate(id, req.user!.userId, req.body.reason);
      res.json({ success: true, data: { message: 'Template deleted.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
