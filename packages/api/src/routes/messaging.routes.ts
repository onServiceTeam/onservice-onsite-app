import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { sendMessageSchema, createConversationSchema } from '../validators/messaging.validators';
import { createAppError } from '../middleware/error.middleware';
import * as messagingService from '../services/messaging.service';
import * as notificationService from '../services/notification.service';
import { emitToConversation, emitToUser } from '../services/socket.service';
import { db } from '../models/db';

const router = Router();

function getParamId(req: AuthenticatedRequest, name = 'id'): string {
  const id = req.params[name];
  if (typeof id !== 'string' || !id) throw createAppError(`${name} is required.`, 400);
  return id;
}

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversations = await messagingService.getUserConversations(req.user!.userId);
      res.json({
        success: true,
        data: conversations.map(messagingService.formatConversation),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  validationMiddleware(createConversationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { bookingId } = req.body;
      const userId = req.user!.userId;

      interface BookingLookup {
        customer_id: string;
        provider_id: string | null;
      }
      const bookingResult = await db.query<BookingLookup>(
        `SELECT b.customer_id, p.user_id AS provider_id
         FROM bookings b
         LEFT JOIN providers p ON b.provider_id = p.id
         WHERE b.id = $1`,
        [bookingId],
      );

      if (bookingResult.rows.length === 0) {
        throw createAppError('Booking not found.', 404);
      }

      const booking = bookingResult.rows[0]!;
      if (booking.customer_id !== userId && booking.provider_id !== userId) {
        throw createAppError('You are not part of this booking.', 403);
      }

      if (!booking.provider_id) {
        throw createAppError('No provider assigned to this booking yet.', 400);
      }

      const conversation = await messagingService.getOrCreateConversation(
        bookingId,
        booking.customer_id,
        booking.provider_id,
      );

      res.status(201).json({
        success: true,
        data: messagingService.formatConversation(conversation),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/messages',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversationId = getParamId(req);
      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 50, 100);

      const result = await messagingService.getMessages(
        conversationId,
        req.user!.userId,
        page,
        pageSize,
      );

      res.json({
        success: true,
        data: result.messages.map(messagingService.formatMessage),
        meta: {
          total: result.total,
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
  '/:id/messages',
  authMiddleware,
  validationMiddleware(sendMessageSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversationId = getParamId(req);
      const userId = req.user!.userId;

      const message = await messagingService.sendMessage(
        conversationId,
        userId,
        req.body.content,
        req.body.messageType,
        req.body.imageUrl,
      );

      const conversation = await messagingService.getConversationById(conversationId, userId);
      const recipientId = conversation.customer_id === userId
        ? conversation.provider_id
        : conversation.customer_id;

      const formatted = messagingService.formatMessage(message);

      emitToConversation(conversationId, 'new:message', formatted);
      emitToUser(recipientId, 'notification:message', {
        conversationId,
        message: formatted,
      });

      await notificationService.createNotification({
        userId: recipientId,
        type: 'new_message',
        title: 'New Message',
        body: req.body.content.slice(0, 100),
        data: { conversationId, bookingId: conversation.booking_id },
      });

      res.status(201).json({
        success: true,
        data: formatted,
      });
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
      const conversationId = getParamId(req);
      const userId = req.user!.userId;
      const count = await messagingService.markMessagesAsRead(conversationId, userId);

      if (count > 0) {
        emitToConversation(conversationId, 'messages:read', {
          conversationId,
          readBy: userId,
          count,
        });
      }

      res.json({ success: true, data: { markedRead: count } });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/unread/count',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const count = await messagingService.getUnreadCount(req.user!.userId);
      res.json({ success: true, data: { unreadCount: count } });
    } catch (error) {
      next(error);
    }
  },
);

// D26 — a participant reports a message; it surfaces in the admin moderation
// queue. Path is /messages/:messageId/report (distinct from /:id/messages).
router.post(
  '/messages/:messageId/report',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const messageId = getParamId(req, 'messageId');
      await messagingService.reportMessage(
        messageId,
        req.user!.userId,
        String(req.body?.reason ?? ''),
      );
      res.json({ success: true, data: { reported: true } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
