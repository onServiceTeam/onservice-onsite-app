/**
 * Phase 14 Dispatch 11 — useSocketRoom
 *
 * Generalises the conversation-room pattern in useSocket() to any
 * server-side socket room: booking-{id}, provider-{id}, search-area-{geo}.
 *
 * D38 Milestone 2 (critique L7): listeners go through socket.service
 * subscribeSocketEvent, so they work before the first connect and across
 * reconnects, and the connection is owned by RealtimeGate (this hook never
 * connects or disconnects). Note: the API has no `room:join` handler today;
 * the server delivers user events to the signed-in user's own room, so the
 * listeners below receive them whether or not the room exists.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { getSocket, isSocketConnected, subscribeSocketEvent } from '@/services/socket.service';

export interface SocketRoomEvent {
  event: string;
  handler: (payload: unknown) => void;
}

export function useSocketRoom(
  roomName: string | undefined,
  events: SocketRoomEvent[] = [],
): { isConnected: boolean } {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !roomName) return;
    const socket = getSocket();
    if (socket?.connected) socket.emit('room:join', { room: roomName });

    const cleanups = events.map(({ event, handler }) => subscribeSocketEvent(event, handler));

    return () => {
      for (const cleanup of cleanups) cleanup();
      const current = getSocket();
      if (current?.connected) current.emit('room:leave', { room: roomName });
    };
    // events identity changes per render; consumers should memoize.

  }, [roomName, isAuthenticated]);

  return { isConnected: isSocketConnected() };
}

export default useSocketRoom;
