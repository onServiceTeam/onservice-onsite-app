/**
 * Admin chat moderation routes (D26 step 1).
 * Mounted at `/api/v1/admin/conversations`.
 *
 * Auth: every endpoint requires admin or super_admin. Reads bypass the
 * participant filter (admins are not parties to the chat); the thread-read and
 * the moderation writes are audit-logged in the service via admin_actions.
 */
import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as messagingAdminService from '../services/messaging-admin.service';

const router = Router();

function requireAdmin(req: AuthenticatedRequest): void {
  if (req.user!.role !== 'admin' && req.user!.role !== 'super_admin') {
    throw createAppError('Admin access required.', 403);
  }
}

function getParamId(req: AuthenticatedRequest, name = 'id'): string {
  const id = req.params[name];
  if (typeof id !== 'string' || !id) throw createAppError(`${name} is required.`, 400);
  return id;
}

// ─── List + stats + queue (declared before /:id so they are not shadowed) ────

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const filter = req.query.filter === 'flagged' || req.query.filter === 'reported'
        ? req.query.filter
        : 'all';
      const data = await messagingAdminService.listConversationsForAdmin({
        filter,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 25),
      });
      res.json({ success: true, ...data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/stats',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await messagingAdminService.getModerationStats();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/queue',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const scope = req.query.scope === 'flagged' || req.query.scope === 'reported'
        ? req.query.scope
        : 'all';
      const data = await messagingAdminService.listModerationQueue({
        scope,
        page: Number(req.query.page ?? 1),
        pageSize: Number(req.query.pageSize ?? 25),
      });
      res.json({ success: true, ...data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Moderation actions on a message ─────────────────────────────────────────

router.post(
  '/messages/:messageId/redact',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const messageId = getParamId(req, 'messageId');
      const data = await messagingAdminService.redactMessage(
        messageId,
        req.user!.userId,
        String(req.body?.reason ?? ''),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/messages/:messageId/review',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const messageId = getParamId(req, 'messageId');
      const data = await messagingAdminService.reviewFlag(messageId, req.user!.userId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Single conversation thread (audit-logged; declared last) ────────────────

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const data = await messagingAdminService.getConversationThreadForAdmin(
        getParamId(req),
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
