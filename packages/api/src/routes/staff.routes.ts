import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import * as staffService from '../services/staff.service';
import { createAppError } from '../middleware/error.middleware';
import { platformConfig } from '../config/platform.config';

const router = Router();

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw createAppError('ID is required.', 400);
  return id;
}

// ─── Roles ─────────────────────────────────────────────────────────

router.get(
  '/roles',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const roles = await staffService.listRoles();
      res.json({ success: true, data: roles });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/roles',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, permissions } = req.body;
      if (!name || !permissions || !Array.isArray(permissions)) {
        throw createAppError('Name and permissions array are required.', 400);
      }
      const role = await staffService.createRole({ name, description, permissions });
      res.status(201).json({ success: true, data: role });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/roles/:id',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, permissions } = req.body;
      const role = await staffService.updateRole(getParamId(req), { name, description, permissions });
      res.json({ success: true, data: role });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/roles/:id',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await staffService.deleteRole(getParamId(req));
      res.json({ success: true, message: 'Role deleted.' });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Staff Members ─────────────────────────────────────────────────

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || platformConfig.defaultPageSize, platformConfig.maxPageSize);
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const roleId = req.query.roleId as string | undefined;
      const result = await staffService.listStaff({ page, limit, isActive, roleId });
      res.json({ success: true, data: result.staff, meta: { total: result.total, page, limit } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, roleId } = req.body;
      if (!userId || !roleId) throw createAppError('User ID and role ID are required.', 400);
      const member = await staffService.addStaffMember({ userId, roleId });
      res.status(201).json({ success: true, data: member });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:id',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { roleId, isActive } = req.body;
      const member = await staffService.updateStaffMember(getParamId(req), { roleId, isActive });
      res.json({ success: true, data: member });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await staffService.removeStaffMember(getParamId(req));
      res.json({ success: true, message: 'Staff member removed.' });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Permissions List ──────────────────────────────────────────────

router.get(
  '/permissions',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: staffService.ALL_PERMISSIONS });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
