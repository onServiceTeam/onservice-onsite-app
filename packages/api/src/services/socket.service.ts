import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as messagingService from './messaging.service';
import { db } from '../models/db';

interface AuthPayload {
  userId: string;
  role: string;
  sessionVersion?: number;
  exp: number; // unix-seconds JWT expiry
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  // MED-N138 fix — track JWT exp on the socket so we can disconnect
  // sessions whose token has expired even when the long-lived
  // socket connection is still open. Pre-fix the role/userId set
  // at handshake was trusted forever; an admin demoted to a lower
  // role mid-session kept emitting admin events until the socket
  // physically disconnected (potentially hours).
  tokenExp?: number;
  // MED-N139 fix — per-socket sliding-window event counter for rate
  // limiting. Pre-fix a malicious client could flood typing/mark:read
  // events with no throttle.
  rlEventCount?: number;
  rlWindowStart?: number;
}

// MED-N139 fix — per-socket rate limit constants. 60 events / 60s
// window is a generous-but-finite cap. typing:start/stop, mark:read,
// send:message, join/leave:conversation all count.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 60;

function checkRateLimit(socket: AuthenticatedSocket): boolean {
  const now = Date.now();
  if (!socket.rlWindowStart || now - socket.rlWindowStart > RATE_LIMIT_WINDOW_MS) {
    socket.rlWindowStart = now;
    socket.rlEventCount = 1;
    return true;
  }
  socket.rlEventCount = (socket.rlEventCount ?? 0) + 1;
  return socket.rlEventCount <= RATE_LIMIT_MAX_EVENTS;
}

// MED-N138 fix — periodic exp check. If the socket's JWT has expired,
// emit auth:expired and disconnect. Runs every 60s per socket.
const EXP_CHECK_INTERVAL_MS = 60_000;

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

  io.use(async (socket: AuthenticatedSocket, next) => {
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

      const canonical = await db.query<{
        role: string;
        is_active: boolean;
        session_version: number | string;
      }>(
        `SELECT role, is_active, session_version
           FROM users
          WHERE id = $1`,
        [payload.userId],
      );
      const account = canonical.rows[0];
      const tokenVersion = Number(payload.sessionVersion ?? 1);
      const currentVersion = Number(account?.session_version);
      if (!account?.is_active
          || account.role !== payload.role
          || !Number.isSafeInteger(tokenVersion)
          || tokenVersion < 1
          || !Number.isSafeInteger(currentVersion)
          || currentVersion < 1
          || tokenVersion !== currentVersion) {
        next(new Error('Session revoked'));
        return;
      }

      socket.userId = payload.userId;
      socket.userRole = account.role;
      socket.tokenExp = payload.exp;
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

    // MED-N138 fix — periodic JWT expiry check. If the socket's token
    // has expired (exp passed), emit auth:expired and force-disconnect.
    // Pre-fix the role/userId captured at handshake was trusted forever
    // — a long-lived socket connection survived JWT rotation, role
    // demotion, and account deactivation.
    const expCheck = setInterval(() => {
      const exp = socket.tokenExp;
      if (exp && Date.now() / 1000 > exp) {
        logger.info('Socket token expired; disconnecting', { userId, socketId: socket.id });
        socket.emit('auth:expired', { reason: 'token_expired' });
        socket.disconnect(true);
      }
    }, EXP_CHECK_INTERVAL_MS);
    // Make sure the interval doesn't keep the process alive at shutdown.
    expCheck.unref?.();

    socket.on('join:conversation', async (conversationId: string) => {
      if (!checkRateLimit(socket)) {
        socket.emit('error', { message: 'Rate limit exceeded; slow down.' });
        return;
      }
      try {
        await messagingService.getConversationById(conversationId, userId);
        socket.join(`conversation:${conversationId}`);
        logger.debug('Joined conversation room', { userId, conversationId });
      } catch {
        socket.emit('error', { message: 'Cannot join conversation' });
      }
    });

    socket.on('leave:conversation', (conversationId: string) => {
      if (!checkRateLimit(socket)) return;
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('send:message', async (data: {
      conversationId: string;
      content: string;
      messageType?: 'text' | 'image' | 'location';
      imageUrl?: string;
    }) => {
      if (!checkRateLimit(socket)) {
        socket.emit('error', { message: 'Rate limit exceeded; slow down.' });
        return;
      }
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
      if (!checkRateLimit(socket)) {
        socket.emit('error', { message: 'Rate limit exceeded; slow down.' });
        return;
      }
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

    // Typing events must be authorized like join/send/mark-read — otherwise a
    // user could spam fake "typing" indicators into any conversation room they
    // aren't a participant of. Silent on failure (no error spam, like rate-limit).
    socket.on('typing:start', async (conversationId: string) => {
      if (!checkRateLimit(socket)) return;
      try {
        await messagingService.getConversationById(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit('typing:start', { userId });
      } catch { /* not a participant — drop silently */ }
    });

    socket.on('typing:stop', async (conversationId: string) => {
      if (!checkRateLimit(socket)) return;
      try {
        await messagingService.getConversationById(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId });
      } catch { /* not a participant — drop silently */ }
    });

    socket.on('disconnect', () => {
      clearInterval(expCheck);
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

/**
 * Disconnect every live socket for one account after an access-sensitive
 * account transition commits. The next handshake must present a token with
 * the current role and session generation.
 */
export function disconnectUserSockets(userId: string): void {
  io?.in(`user:${userId}`).disconnectSockets(true);
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
  DISPUTE_UPDATED: 'dispute:updated',
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
