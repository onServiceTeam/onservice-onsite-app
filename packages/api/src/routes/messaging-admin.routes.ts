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
import { validationMiddleware } from '../middleware/validation.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import * as messagingAdminService from '../services/messaging-admin.service';
import {
  conversationIdParamsSchema,
  conversationListQuerySchema,
  messageIdParamsSchema,
  moderationQueueQuerySchema,
  redactMessageSchema,
  reviewMessageSchema,
} from '../validators/messaging-admin.validators';

const router = Router();

function getParamId(req: AuthenticatedRequest, name = 'id'): string {
  const id = req.params[name];
  if (typeof id !== 'string' || !id) throw createAppError(`${name} is required.`, 400);
  return id;
}

// ─── List + stats + queue (declared before /:id so they are not shadowed) ────

router.get(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ query: conversationListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await messagingAdminService.listConversationsForAdmin({
        filter: req.query.filter as 'all' | 'flagged' | 'reported',
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        page: req.query.page as unknown as number,
        pageSize: req.query.pageSize as unknown as number,
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
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
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
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ query: moderationQueueQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await messagingAdminService.listModerationQueue({
        scope: req.query.scope as 'all' | 'flagged' | 'reported',
        page: req.query.page as unknown as number,
        pageSize: req.query.pageSize as unknown as number,
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
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: messageIdParamsSchema, body: redactMessageSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const messageId = getParamId(req, 'messageId');
      const data = await messagingAdminService.redactMessage(
        messageId,
        req.user!.userId,
        req.body.reason as string,
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
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: messageIdParamsSchema, body: reviewMessageSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const messageId = getParamId(req, 'messageId');
      const data = await messagingAdminService.reviewFlag(
        messageId,
        req.user!.userId,
        req.body.reviewNote as string,
      );
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
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: conversationIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
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
