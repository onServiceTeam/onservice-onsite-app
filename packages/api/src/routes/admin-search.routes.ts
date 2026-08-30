import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as adminSearchService from '../services/admin-search.service';

const router = Router();

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search must contain at least 2 characters.').max(100),
}).strict();

function requireOperationsAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    // E34: do not infer a general-operations search grant for the privacy-only
    // DPO role while its complete route/API matrix remains unresolved.
    throw createAppError('Operations admin access required.', 403);
  }
}

router.get(
  '/',
  authMiddleware,
  validationMiddleware({ query: adminSearchQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireOperationsAdmin(req);
      const { q } = req.query as unknown as { q: string };
      const data = await adminSearchService.searchAdminRecords(q);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
