/**
 * Phase 14 Dispatch 07 — checklist routes.
 * Bug 460 + 463 — server-driven checklist with completion validation.
 *
 * Routes:
 *   GET   /api/v1/jobs/:id/checklist                     — fetch (creates on provider's first open)
 *   PATCH /api/v1/jobs/:id/checklist/items/:itemId       — toggle item completion
 */

import { Router, type Response, type NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as checklistService from '../services/checklist.service';

const router = Router();

function resolveActorRole(req: AuthenticatedRequest): 'customer' | 'provider' | 'admin' {
  const role = req.user!.role;
  if (role === 'admin' || role === 'super_admin') return 'admin';
  if (role === 'provider') return 'provider';
  return 'customer';
}

router.get(
  '/jobs/:id/checklist',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string | undefined;
      if (typeof id !== 'string' || !id) {
        throw createAppError('Booking ID is required.', 400);
      }
      const data = await checklistService.getChecklistForBooking(
        id,
        req.user!.userId,
        resolveActorRole(req),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/jobs/:id/checklist/items/:itemId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const itemId = req.params.itemId as string | undefined;
      if (typeof itemId !== 'string' || !itemId) {
        throw createAppError('Item ID is required.', 400);
      }
      const body = req.body as { completed?: unknown; photoId?: unknown; notes?: unknown };
      if (typeof body.completed !== 'boolean') {
        throw createAppError('completed (boolean) is required.', 400);
      }
      const photoId = typeof body.photoId === 'string' && body.photoId.length > 0
        ? body.photoId
        : null;
      const notes = typeof body.notes === 'string' ? body.notes : null;

      const data = await checklistService.toggleChecklistItem(
        itemId,
        req.user!.userId,
        resolveActorRole(req),
        { completed: body.completed, photoId, notes },
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
