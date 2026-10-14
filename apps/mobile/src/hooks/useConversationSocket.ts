/**
 * D38 Milestone 2: live events for one open chat thread.
 *
 * Joins the thread's room (socket.service joins it again after every
 * reconnect), listens for new messages, read receipts, typing and state
 * changes for this thread only, and on unmount removes only its own
 * listeners and leaves the room. Before, the provider chat screen called
 * `off('new:message')` with no handler, which removed every other screen's
 * listener too.
 */
import { REALTIME_EVENTS, type ConversationStatePayload } from '@/config/realtime-events';
import { useEffect } from 'react';
import type { Message } from '@/services/messaging.service';
import { joinConversation, leaveConversation } from '@/services/socket.service';
import { useSocketEvent } from './useSocketEvent';

export interface ConversationSocketHandlers {
  onMessage?: (message: Message) => void;
  onRead?: (readBy: string) => void;
  onTyping?: (userId: string, typing: boolean) => void;
  onState?: (payload: ConversationStatePayload) => void;
}

export function useConversationSocket(
  conversationId: string | null | undefined,
  handlers: ConversationSocketHandlers,
): void {
  useEffect(() => {
    if (!conversationId) return undefined;
    joinConversation(conversationId);
    return () => { leaveConversation(conversationId); };
  }, [conversationId]);

  const active = conversationId ? true : false;

  useSocketEvent<Message>(active ? REALTIME_EVENTS.NEW_MESSAGE : null, (message) => {
    if (message?.conversationId === conversationId) handlers.onMessage?.(message);
  });
  useSocketEvent<{ conversationId: string; readBy: string }>(active ? REALTIME_EVENTS.MESSAGES_READ : null, (data) => {
    if (data?.conversationId === conversationId) handlers.onRead?.(data.readBy);
  });
  useSocketEvent<ConversationStatePayload>(active ? REALTIME_EVENTS.CONVERSATION_STATE : null, (payload) => {
    if (payload?.conversationId === conversationId) handlers.onState?.(payload);
  });
  // Typing events are sent to the thread room only, so they carry no thread id.
  useSocketEvent<{ userId: string }>(active ? 'typing:start' : null, (data) => {
    if (data?.userId) handlers.onTyping?.(data.userId, true);
  });
  useSocketEvent<{ userId: string }>(active ? 'typing:stop' : null, (data) => {
    if (data?.userId) handlers.onTyping?.(data.userId, false);
  });
}

export default useConversationSocket;
