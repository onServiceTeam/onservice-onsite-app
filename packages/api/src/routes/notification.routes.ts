import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as notificationService from '../services/notification.service';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { validationMiddleware } from '../middleware/validation.middleware';
import { notificationListQuerySchema, notificationPreferencesSchema } from '../validators/notification.validators';

const router = Router();

router.get(
  '/',
  authMiddleware,
  validationMiddleware({ query: notificationListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page);
      const pageSize = Number(req.query.pageSize);

      const result = await notificationService.getUserNotifications(
        req.user!.userId,
        page,
        pageSize,
      );

      res.json({
        success: true,
        data: result.notifications.map(notificationService.formatNotification),
        meta: {
          total: result.total,
          unread: result.unread,
          page,
          pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/read-all',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const count = await notificationService.markAllNotificationsRead(req.user!.userId);
      res.json({ success: true, data: { markedRead: count } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/push-token',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { token, platform } = req.body;
      if (typeof token !== 'string' || !token) {
        throw createAppError('Push token is required.', 400);
      }
      // BUG-PHASE157-01 fix — pre-fix push_tokens.token had no
      // length cap. Column is TEXT (migration 016) so Postgres
      // accepts any length. Real push tokens are well-bounded:
      //   APNs:  64 hex chars
      //   FCM:   ~150-200 chars
      //   Expo:  ~50-80 chars (ExponentPushToken[...])
      // Cap at 256 — generous enough for any realistic provider,
      // tight enough to reject obvious junk. Same defense-in-depth
      // pattern as Phase 152-156.
      const PUSH_TOKEN_MAX = 256;
      if (token.length > PUSH_TOKEN_MAX) {
        throw createAppError(
          `Push token must be ≤ ${PUSH_TOKEN_MAX} characters.`,
          400,
        );
      }
      if (typeof platform !== 'string' || !['ios', 'android', 'web'].includes(platform)) {
        throw createAppError('Platform must be ios, android, or web.', 400);
      }

      await db.query(
        `INSERT INTO push_tokens (user_id, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, token) DO UPDATE SET platform = $3, updated_at = NOW()`,
        [req.user!.userId, token, platform],
      );

      logger.info('Push token registered', { userId: req.user!.userId, platform });
      res.json({ success: true, data: { message: 'Push token registered.' } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/preferences',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const prefs = await notificationService.getNotificationPreferences(req.user!.userId);
      res.json({ success: true, data: prefs });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/preferences',
  authMiddleware,
  validationMiddleware(notificationPreferencesSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const prefs = await notificationService.updateNotificationPreferences(req.user!.userId, req.body);
      res.json({ success: true, data: prefs });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:id/read',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (typeof id !== 'string') throw createAppError('Notification ID is required.', 400);

      await notificationService.markNotificationRead(id, req.user!.userId);
      res.json({ success: true, data: { message: 'Notification marked as read.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
