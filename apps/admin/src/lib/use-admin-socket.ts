/**
 * Phase 10 — Admin singleton socket.io client + React hook bindings.
 *
 * Bug 1251 fix: the access token is no longer in localStorage. Socket.io
 * connects with `withCredentials: true` so the browser sends the
 * admin_session HttpOnly cookie automatically. The server's socket auth
 * middleware reads either the cookie or the (legacy) handshake-auth token.
 */

import { useEffect, useState, useRef } from 'react';
import { io as socketIo, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';

// BUG-PHASE18-01 fix — pre-fix this fallback was 'http://localhost:7383'
// which is the Postgres port (since Phase 16). Socket.io would try to
// upgrade to ws://localhost:7383/socket.io which Postgres rejected,
// flooding the console with "WebSocket connection failed" errors on
// every admin page. Real API runs on 7381 in dev (see api/src/server.ts
// PORT default + .env API_PORT). When VITE_API_URL is set (production
// build), it overrides; this is dev-only.
const FALLBACK_API_URL = 'http://localhost:7381';

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL ?? FALLBACK_API_URL;
}

let cachedSocket: Socket | null = null;
let cachedUserId: string | null = null;

export function getAdminSocket(): Socket | null {
  const user = useAuthStore.getState().user;
  if (!user) {
    if (cachedSocket) {
      cachedSocket.disconnect();
      cachedSocket = null;
      cachedUserId = null;
    }
    return null;
  }

  if (cachedSocket && cachedUserId === user.id) {
    return cachedSocket;
  }

  // User changed (fresh login or impersonation). Tear down the old socket so
  // we never leak a stale auth context.
  if (cachedSocket) {
    cachedSocket.disconnect();
    cachedSocket = null;
  }

  cachedUserId = user.id;
  cachedSocket = socketIo(getApiUrl(), {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });

  return cachedSocket;
}

/**
 * Subscribe to a server-emitted event for the lifetime of the component.
 * Caller asserts the payload shape via the generic <T>.
 */
export function useAdminSocketEvent<T>(event: string, handler: (data: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;

    const wrapped = (data: T): void => {
      handlerRef.current(data);
    };
    socket.on(event, wrapped);
    return () => {
      socket.off(event, wrapped);
    };
  }, [event]);
}

export type AdminSocketStatus = 'connected' | 'connecting' | 'disconnected';

export function useAdminSocketStatus(): AdminSocketStatus {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [status, setStatus] = useState<AdminSocketStatus>('disconnected');

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('disconnected');
      return;
    }
    const socket = getAdminSocket();
    if (!socket) {
      setStatus('disconnected');
      return;
    }

    setStatus(socket.connected ? 'connected' : 'connecting');

    const onConnect = (): void => setStatus('connected');
    const onDisconnect = (): void => setStatus('disconnected');
    const onConnecting = (): void => setStatus('connecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onConnecting);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onConnecting);
    };
  }, [isAuthenticated]);

  return status;
}
