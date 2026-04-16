import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { createAppError } from '../middleware/error.middleware';
import * as notificationService from '../services/notification.service';
import { db } from '../models/db';
import { logger } from '../utils/logger';

const router = Router();

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 20, 50);

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
