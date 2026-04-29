import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as messagingService from './messaging.service';

interface AuthPayload {
  userId: string;
  role: string;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.APP_URL || 'http://localhost:7382',
      credentials: true,
    },
    pingTimeout: platformConfig.socketPingTimeoutMs,
    pingInterval: platformConfig.socketPingIntervalMs,
  });

  io.use((socket: AuthenticatedSocket, next) => {
    // Bug 1251 fix: prefer the admin_session HttpOnly cookie when the browser
    // sends one (admin web), and fall back to the legacy handshake-auth token
    // (mobile clients still pass it explicitly).
    let token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie ?? '';
      const match = /(?:^|;\s*)admin_session=([^;]+)/.exec(cookieHeader);
      if (match) {
        token = decodeURIComponent(match[1]!);
      }
    }

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      next(new Error('Server configuration error'));
      return;
    }

    try {
      const payload = jwt.verify(token, secret) as AuthPayload & { type?: string };

      // Reject partial/non-access tokens (parity with HTTP auth middleware)
      if (payload.type === 'pre_auth_2fa' || payload.type === 'refresh') {
        next(new Error('Invalid token type'));
        return;
      }

      socket.userId = payload.userId;
      socket.userRole = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userId = socket.userId!;

    socket.join(`user:${userId}`);
    logger.debug('Socket connected', { userId, socketId: socket.id });

    if (socket.userRole === 'admin' || socket.userRole === 'super_admin') {
      socket.join('admin:global');
      logger.debug('Admin socket joined admin:global', { userId });
    }

    socket.on('join:conversation', async (conversationId: string) => {
      try {
        await messagingService.getConversationById(conversationId, userId);
        socket.join(`conversation:${conversationId}`);
        logger.debug('Joined conversation room', { userId, conversationId });
      } catch {
        socket.emit('error', { message: 'Cannot join conversation' });
      }
    });

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('send:message', async (data: {
      conversationId: string;
      content: string;
      messageType?: 'text' | 'image' | 'location';
      imageUrl?: string;
    }) => {
      try {
        if (!data.content || typeof data.content !== 'string' || data.content.length > 2000) {
          socket.emit('error', { message: 'Message content is required and must be under 2000 characters.' });
          return;
        }
        if (!data.conversationId || typeof data.conversationId !== 'string') {
          socket.emit('error', { message: 'Conversation ID is required.' });
          return;
        }
        const validTypes = ['text', 'image', 'location'] as const;
        const msgType = data.messageType && validTypes.includes(data.messageType) ? data.messageType : 'text';

        const message = await messagingService.sendMessage(
          data.conversationId,
          userId,
          data.content,
          msgType,
          data.imageUrl,
        );

        const formatted = messagingService.formatMessage(message);

        io?.to(`conversation:${data.conversationId}`).emit('new:message', formatted);

        const conversation = await messagingService.getConversationById(data.conversationId, userId);
        const recipientId = conversation.customer_id === userId
          ? conversation.provider_id
          : conversation.customer_id;

        io?.to(`user:${recipientId}`).emit('notification:message', {
          conversationId: data.conversationId,
          message: formatted,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to send message';
        socket.emit('error', { message: error });
      }
    });

    socket.on('mark:read', async (conversationId: string) => {
      try {
        const count = await messagingService.markMessagesAsRead(conversationId, userId);
        if (count > 0) {
          io?.to(`conversation:${conversationId}`).emit('messages:read', {
            conversationId,
            readBy: userId,
            count,
          });
        }
      } catch {
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { userId });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId });
    });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { userId, socketId: socket.id });
    });
  });

  logger.info('Socket.io server initialized');
  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToConversation(conversationId: string, event: string, data: unknown): void {
  io?.to(`conversation:${conversationId}`).emit(event, data);
}

// ─── Phase 10: Real-time admin dispatch console ─────────────────────────────

/**
 * Emit an event to all connected admin/super_admin sockets (room admin:global).
 * No-op when the socket server has not been initialized (e.g. during unit
 * tests that do not boot the HTTP server).
 */
export function emitAdminEvent(event: string, data: unknown): void {
  io?.to('admin:global').emit(event, data);
}

/**
 * Canonical list of admin-facing socket events. Callers should reference these
 * constants rather than raw strings so the event surface stays discoverable
 * and consistent across services.
 */
export const ADMIN_EVENTS = {
  BOOKING_CREATED: 'booking:created',
  BOOKING_STATUS_CHANGED: 'booking:status_changed',
  BOOKING_PROVIDER_ASSIGNED: 'booking:provider_assigned',
  BOOKING_GPS_UPDATE: 'booking:gps_update',
  DISPUTE_FILED: 'dispute:filed',
  DISPUTE_RESOLVED: 'dispute:resolved',
  PROVIDER_ONLINE: 'provider:online',
  PROVIDER_OFFLINE: 'provider:offline',
  ALERT_NEW: 'alert:new',
} as const;

export type AdminEvent = typeof ADMIN_EVENTS[keyof typeof ADMIN_EVENTS];

/**
 * TEST-ONLY helper. Allows unit tests to inject a mocked `io` instance (or
 * reset to null) without booting an actual HTTP/Socket.IO server. Production
 * code MUST NOT call this — use {@link initSocketServer} instead.
 */
export function _setIoForTest(mockIo: Server | null): void {
  io = mockIo;
}
