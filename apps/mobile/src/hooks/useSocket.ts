import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  joinConversation,
  leaveConversation,
  emitTypingStart,
  emitTypingStop,
  emitMarkRead,
} from '@/services/socket.service';

/**
 * Hook for managing Socket.io connection lifecycle and conversation-scoped events.
 * Automatically connects on mount when authenticated, disconnects on unmount.
 *
 * @param conversationId Optional — auto-joins/leaves the conversation room.
 */
export function useSocket(conversationId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const listenerCleanups = useRef<Array<() => void>>([]);

  // Connect/disconnect based on auth state
  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    }
    return () => {
      listenerCleanups.current.forEach((fn) => fn());
      listenerCleanups.current = [];
    };
  }, [isAuthenticated]);

  // Join/leave conversation room
  useEffect(() => {
    if (conversationId && isAuthenticated) {
      joinConversation(conversationId);
      return () => { leaveConversation(conversationId); };
    }
    return undefined;
  }, [conversationId, isAuthenticated]);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    const socket = getSocket();
    if (socket) {
      socket.on(event, handler);
      const cleanup = (): void => { socket.off(event, handler); };
      listenerCleanups.current.push(cleanup);
      return cleanup;
    }
    return () => {};
  }, []);

  return {
    socket: getSocket(),
    isConnected: !!getSocket()?.connected,
    on,
    disconnect: disconnectSocket,
    typingStart: emitTypingStart,
    typingStop: emitTypingStop,
    markRead: emitMarkRead,
  };
}
