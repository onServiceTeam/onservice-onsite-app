/**
 * Phase 14 Dispatch 11 — useSocketRoom
 *
 * Generalises the conversation-room pattern in useSocket() to any
 * server-side socket room: booking-{id}, provider-{id}, search-area-{geo}.
 * Used on booking-detail (live status updates), home (area updates),
 * and search (real-time slot availability).
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  connectSocket,
  getSocket,
} from '@/services/socket.service';

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
    connectSocket();
    const socket = getSocket();
    if (!socket) return;

    socket.emit('room:join', { room: roomName });

    const cleanups: Array<() => void> = [];
    for (const { event, handler } of events) {
      socket.on(event, handler);
      cleanups.push(() => socket.off(event, handler));
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      socket.emit('room:leave', { room: roomName });
    };
    // events identity changes per render; consumers should memoize.

  }, [roomName, isAuthenticated]);

  return { isConnected: !!getSocket()?.connected };
}

export default useSocketRoom;
