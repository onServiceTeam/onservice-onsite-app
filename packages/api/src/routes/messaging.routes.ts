import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  sendMessageSchema,
  createConversationSchema,
  inboxQuerySchema,
  messagesCursorSchema,
  conversationIdParamsSchema,
} from '../validators/messaging.validators';
import { createAppError } from '../middleware/error.middleware';
import * as messagingService from '../services/messaging.service';
import { emitToConversation } from '../services/socket.service';

// Mounted at /api/v1/conversations and /api/v1/messaging (server.ts). D38
// request threads (Milestone 2, package P4): a booking can have one thread per
// provider, each with an open or read-only state. Plan:
// qa-frameworks/human-audit-2026-10-13/merged.md section 2.3 (Threads),
// design-threads.md section 3. Old apps (1.0.2, 1.0.3) keep working: the list
// without ?view=, POST / with only bookingId, and page/pageSize message reads
// are served as before.
//
// Photo and voice messages (Milestone 2 wave 3): every response that carries
// a media message (the send, both message reads and the inbox) mints the
// signed link for the signed-in participant (messaging.service
// mediaUrlsForViewer), so a link is always fresh and always the reader's own.

const router = Router();

function getParamId(req: AuthenticatedRequest, name = 'id'): string {
  const id = req.params[name];
  if (typeof id !== 'string' || !id) throw createAppError(`${name} is required.`, 400);
  return id;
}

function viewerOf(req: AuthenticatedRequest): messagingService.MediaViewer {
  return { userId: req.user!.userId, role: req.user!.role };
}

/** Validate ?view=inbox queries; the legacy list (no view) passes through. */
function inboxQueryValidation(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.query.view === undefined) {
    next();
    return;
  }
  validationMiddleware({ query: inboxQuerySchema })(req, res, next);
}

/** Validate cursor paging; old apps that send only page/pageSize pass through. */
function cursorQueryValidation(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const { before, after, limit } = req.query;
  if (before === undefined && after === undefined && limit === undefined) {
    next();
    return;
  }
  validationMiddleware({ query: messagesCursorSchema })(req, res, next);
}

router.get(
  '/',
  authMiddleware,
  inboxQueryValidation,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      if (req.query.view === 'inbox') {
        const query = req.query as unknown as {
          state: 'open' | 'read_only' | 'all';
          bookingId?: string;
          page: number;
          pageSize: number;
        };
        const inbox = await messagingService.listInbox(userId, query);
        const mediaUrls = await messagingService.mediaUrlsForViewer(
          viewerOf(req),
          inbox.items.map((row) => ({ media_id: row.last_media_id, redacted_at: row.last_redacted_at })),
        );
        res.json({
          success: true,
          data: {
            items: inbox.items.map((row) => messagingService.formatInboxItem(row, userId, mediaUrls)),
            meta: {
              total: inbox.total,
              page: inbox.page,
              pageSize: inbox.pageSize,
              totalPages: Math.ceil(inbox.total / inbox.pageSize),
            },
          },
        });
        return;
      }
      const conversations = await messagingService.getUserConversations(userId);
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
      const { bookingId, providerUserId } = req.body as { bookingId: string; providerUserId?: string };
      const conversation = await messagingService.resolveConversationForParticipant(
        req.user!.userId,
        bookingId,
        providerUserId,
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

router.get(
  '/:id',
  authMiddleware,
  validationMiddleware({ params: conversationIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversation = await messagingService.getConversationView(getParamId(req), req.user!.userId);
      res.json({ success: true, data: messagingService.formatConversation(conversation) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id/messages',
  authMiddleware,
  cursorQueryValidation,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conversationId = getParamId(req);
      const userId = req.user!.userId;
      const { before, after, limit } = req.query as { before?: string; after?: string; limit?: number };

      if (before !== undefined || after !== undefined || limit !== undefined) {
        const page = await messagingService.getMessagesPage(conversationId, userId, { before, after, limit });
        const participants = {
          customerId: page.conversation.customer_id,
          providerId: page.conversation.provider_id,
        };
        const mediaUrls = await messagingService.mediaUrlsForViewer(viewerOf(req), page.messages);
        res.json({
          success: true,
          data: page.messages.map((message) => messagingService.formatMessage(message, participants, mediaUrls)),
          meta: {
            hasMore: page.hasMore,
            nextBefore: page.nextBefore,
            conversation: {
              id: page.conversation.id,
              state: page.conversation.effective_state,
              stateReason: page.conversation.effective_state_reason ?? null,
            },
          },
        });
        return;
      }

      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 50, 100);

      const result = await messagingService.getMessages(
        conversationId,
        userId,
        page,
        pageSize,
      );

      const mediaUrls = await messagingService.mediaUrlsForViewer(viewerOf(req), result.messages);
      res.json({
        success: true,
        data: result.messages.map((message) => messagingService.formatMessage(message, undefined, mediaUrls)),
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
      const body = req.body as {
        content: string;
        messageType: messagingService.ParticipantMessageType;
        imageUrl?: string;
        mediaId?: string;
        clientMessageId?: string;
      };

      const result = await messagingService.sendParticipantMessage({
        conversationId,
        senderId: req.user!.userId,
        messageType: body.messageType,
        content: body.content,
        imageUrl: body.imageUrl,
        mediaId: body.mediaId,
        clientMessageId: body.clientMessageId,
      });
      // Socket events and the "New message from ..." notice, after commit.
      await messagingService.deliverParticipantMessage(result);

      // The sender's own signed link (also on a duplicate retry).
      const mediaUrls = await messagingService.mediaUrlsForViewer(viewerOf(req), [result.message]);
      const formatted = messagingService.formatMessage(result.message, {
        customerId: result.conversation.customer_id,
        providerId: result.conversation.provider_id,
      }, mediaUrls);
      if (result.duplicate) {
        res.status(200).json({ success: true, data: { ...formatted, duplicate: true } });
        return;
      }
      res.status(201).json({
        success: true,
        data: formatted,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Reading and marking read work in read-only threads too.
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

// D26 — a participant reports a message; it surfaces in the admin moderation
// queue. Path is /messages/:messageId/report (distinct from /:id/messages).
// Reporting works in read-only threads too.
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
