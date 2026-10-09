import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import * as projectService from '../services/project.service';

const router = Router();

export const adminProjectListQuerySchema = z.object({
  search: z.string().trim().min(2).max(100).optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ query: adminProjectListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as z.infer<typeof adminProjectListQuerySchema>;
      const result = await projectService.listProjectsForAdmin(query);
      res.json({
        success: true,
        data: result.projects,
        summary: result.summary,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / result.pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
