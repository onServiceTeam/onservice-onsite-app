/**
 * Phase 10 — Admin singleton socket.io client + React hook bindings.
 *
 * Provides:
 *  - getAdminSocket() — lazily constructs (or returns the cached) Socket.IO
 *    client connected to the API server with the admin's JWT in the auth
 *    handshake. Reconnects when the token in localStorage changes (e.g. after
 *    login or refresh-token rotation handled by api.ts).
 *  - useAdminSocketEvent<T>(event, handler) — typed React hook that subscribes
 *    a handler to a server event for the lifetime of the component.
 *  - useAdminSocketStatus() — connection status badge state.
 *
 * Design notes:
 *  - The auth store does NOT hold the access token (only the user). The token
 *    lives in localStorage under 'admin_token' (see lib/api.ts), so we read
 *    it from there and re-key the connection whenever the auth state flips.
 *  - We deliberately keep this typed without `any`. Payloads are caller-typed
 *    via the generic <T> on useAdminSocketEvent.
 */

import { useEffect, useState, useRef } from 'react';
import { io as socketIo, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';

const FALLBACK_API_URL = 'http://localhost:7383';

function getApiUrl(): string {
  // Vite types ImportMeta.env via vite-env.d.ts — no cast needed.
  return import.meta.env.VITE_API_URL ?? FALLBACK_API_URL;
}

function getToken(): string | null {
  try {
    return localStorage.getItem('admin_token');
  } catch {
    return null;
  }
}

let cachedSocket: Socket | null = null;
let cachedToken: string | null = null;

export function getAdminSocket(): Socket | null {
  const token = getToken();
  if (!token) {
    if (cachedSocket) {
      cachedSocket.disconnect();
      cachedSocket = null;
      cachedToken = null;
    }
    return null;
  }

  if (cachedSocket && cachedToken === token) {
    return cachedSocket;
  }

  // Token changed (rotation, fresh login, logout+login). Tear down the old
  // socket so we never leak a stale auth context.
  if (cachedSocket) {
    cachedSocket.disconnect();
    cachedSocket = null;
  }

  cachedToken = token;
  cachedSocket = socketIo(getApiUrl(), {
    auth: { token },
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
