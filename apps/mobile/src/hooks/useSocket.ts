import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  getSocket,
  isSocketConnected,
  joinConversation,
  leaveConversation,
  subscribeSocketEvent,
  emitTypingStart,
  emitTypingStop,
  emitMarkRead,
} from '@/services/socket.service';

/**
 * Conversation-scoped socket helpers.
 *
 * D38 Milestone 2 (critique L7): the connection itself is owned by
 * RealtimeGate (app/_layout.tsx), so this hook no longer connects or offers a
 * `disconnect` (a screen disconnecting would cut every other screen off).
 * Listeners go through subscribeSocketEvent, so they survive reconnects and
 * an unmount removes only this hook's own listeners. The conversation room
 * is joined again on every reconnect by socket.service.
 *
 * @param conversationId Optional: auto-joins and leaves the conversation room.
 */
export function useSocket(conversationId?: string) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const listenerCleanups = useRef<Array<() => void>>([]);

  useEffect(() => () => {
    listenerCleanups.current.forEach((fn) => fn());
    listenerCleanups.current = [];
  }, []);

  // Join/leave conversation room
  useEffect(() => {
    if (conversationId && isAuthenticated) {
      joinConversation(conversationId);
      return () => { leaveConversation(conversationId); };
    }
    return undefined;
  }, [conversationId, isAuthenticated]);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    const unsubscribe = subscribeSocketEvent(event, handler as (payload: unknown) => void);
    listenerCleanups.current.push(unsubscribe);
    return unsubscribe;
  }, []);

  return {
    socket: getSocket(),
    isConnected: isSocketConnected(),
    on,
    typingStart: emitTypingStart,
    typingStop: emitTypingStop,
    markRead: emitMarkRead,
  };
}
