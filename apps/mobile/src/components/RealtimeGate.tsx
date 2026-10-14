/**
 * D38 Milestone 2: owns the one live connection (socket.service).
 *
 * - Connects whenever someone is signed in, for every role.
 * - Disconnects on sign-out and on an account change (before D38, signing
 *   out never closed the socket).
 * - Connects again when the app comes back to the foreground.
 * - After a reconnect, re-reads the screens that live events keep fresh, in
 *   case an event was missed while the connection was down.
 *
 * Mounted once in app/_layout.tsx, next to PushNotificationGate. It lives at
 * the root (not in a tab layout) because request, quote and chat screens are
 * stack screens outside the tabs, and customers need it too.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket, onSocketStatus } from '@/services/socket.service';

/** Query keys re-read after the live connection comes back. */
export const REALTIME_REFRESH_KEYS: ReadonlyArray<readonly string[]> = [
  ['provider-leads'],
  ['provider-request-summary'],
  ['request-status'],
  ['bookingQuotes'],
  ['notifUnread'],
  ['customer-request-summary'],
  ['chat-inbox'],
  ['chat-unread'],
];

export function RealtimeGate(): null {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const signedIn = isAuthenticated && !!userId;

  useEffect(() => {
    if (!signedIn) {
      disconnectSocket();
      return undefined;
    }
    connectSocket();
    // Sign-out or a different account: close this account's connection.
    return () => { disconnectSocket(); };
  }, [signedIn, userId]);

  useEffect(() => {
    if (!signedIn) return undefined;
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') connectSocket();
    });
    return () => subscription?.remove?.();
  }, [signedIn, userId]);

  const hasConnectedRef = useRef(false);
  useEffect(() => onSocketStatus((connected) => {
    if (!connected) return;
    if (hasConnectedRef.current) {
      for (const queryKey of REALTIME_REFRESH_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    }
    hasConnectedRef.current = true;
  }), [queryClient]);

  return null;
}

export default RealtimeGate;
