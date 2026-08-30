import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import * as staffService from '../services/staff.service';
import { createAppError } from '../middleware/error.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  addStaffMemberSchema,
  createStaffRoleSchema,
  demoteDpoSchema,
  dpoUserIdParamsSchema,
  promoteDpoSchema,
  staffCandidateQuerySchema,
  staffIdParamsSchema,
  staffListQuerySchema,
  staffReasonSchema,
  updateStaffMemberSchema,
  updateStaffRoleSchema,
} from '../validators/staff.validators';

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
  validationMiddleware(createStaffRoleSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, permissions, reason } = req.body;
      const role = await staffService.createRole({
        name,
        description,
        permissions,
        createdByAdminId: req.user!.userId,
        reason,
      });
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
  validationMiddleware({ params: staffIdParamsSchema, body: updateStaffRoleSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, permissions, reason } = req.body;
      const role = await staffService.updateRole(
        getParamId(req),
        { name, description, permissions },
        req.user!.userId,
        reason,
      );
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
  validationMiddleware({ params: staffIdParamsSchema, body: staffReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reason = req.body.reason as string;
      await staffService.deleteRole(getParamId(req), req.user!.userId, reason);
      res.json({ success: true, message: 'Role archived.' });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Staff Members ─────────────────────────────────────────────────

router.get(
  '/candidates',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware({ query: staffCandidateQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { search, limit } = req.query as unknown as { search: string; limit: number };
      const candidates = await staffService.searchStaffCandidates(search, limit);
      res.json({ success: true, data: candidates });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/dpo-candidates',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware({ query: staffCandidateQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { search, limit } = req.query as unknown as { search: string; limit: number };
      const candidates = await staffService.searchDpoCandidates(search, limit);
      res.json({ success: true, data: candidates });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware({ query: staffListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { page, limit, profileActive, profileMissing, accountActive, accountRole, roleId, search } = req.query as unknown as {
        page: number;
        limit: number;
        profileActive?: boolean;
        profileMissing?: boolean;
        accountActive?: boolean;
        accountRole?: 'admin' | 'super_admin' | 'dpo';
        roleId?: string;
        search?: string;
      };
      const result = await staffService.listStaff({ page, limit, profileActive, profileMissing, accountActive, accountRole, roleId, search });
      res.json({ success: true, data: result.staff, meta: { total: result.total, page, limit, summary: result.summary } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware(addStaffMemberSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, roleId, reason } = req.body;
      // MED-N129 fix — pass the acting super_admin's userId so the
      // service can write the audit row.
      const member = await staffService.addStaffMember({
        userId,
        roleId,
        addedByAdminId: req.user!.userId,
        reason,
      });
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
  validationMiddleware({ params: staffIdParamsSchema, body: updateStaffMemberSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { roleId, isActive, reason } = req.body;
      const member = await staffService.updateStaffMember(
        getParamId(req),
        { roleId, isActive },
        req.user!.userId,
        reason,
      );
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
  validationMiddleware({ params: staffIdParamsSchema, body: staffReasonSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // MED-N128 fix — pass the acting super_admin's userId so the
      // service can write the audit row + soft-delete attribution.
      const reason = req.body.reason as string;
      await staffService.removeStaffMember(getParamId(req), req.user!.userId, reason);
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

// ─── DPO role management (E01 / D15) ───────────────────────────────
//
// NPC RA 10173 §21 requires a designated Data Protection Officer with
// independent authority. These endpoints let super_admin assign and
// revoke the DPO role, with full audit trail (admin_actions).

router.get(
  '/dpos',
  authMiddleware,
  rbacMiddleware('super_admin'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const dpos = await staffService.listDpos();
      res.json({ success: true, data: dpos });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/dpos/:userId/promote',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware({ params: dpoUserIdParamsSchema, body: promoteDpoSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.userId as string;
      const reason = req.body.reason as string;
      const result = await staffService.promoteToDpo(userId, req.user!.userId, reason);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/dpos/:userId/demote',
  authMiddleware,
  rbacMiddleware('super_admin'),
  validationMiddleware({ params: dpoUserIdParamsSchema, body: demoteDpoSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.userId as string;
      const demoteTo = req.body.demoteTo as 'admin' | 'customer' | 'provider';
      const reason = req.body.reason as string;
      const result = await staffService.demoteFromDpo(userId, req.user!.userId, reason, demoteTo);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
