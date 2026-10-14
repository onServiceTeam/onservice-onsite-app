import { io, Socket } from 'socket.io-client';
import { platformConfig } from '@/config/platform.config';
import { REALTIME_CLIENT_EVENTS, REALTIME_EVENTS } from '@/config/realtime-events';
// Phase K CRIT-K04 fix — read access token from the canonical
// secure-storage (per-device keychain-backed encryption key) NOT
// the legacy `storage` MMKV instance. Pre-fix the socket connected
// with `auth.token = undefined` because the access token had been
// migrated to the new secure-storage module long ago — this file
// was still reading from the empty legacy bucket. Result: server
// rejected every socket connection, real-time chat / messaging /
// new-job-modal silently broken in production.
import { getAccessToken } from './secure-storage';
import { refreshAuthSession } from './api';

/**
 * D38 Milestone 2 (merged plan, package P5a): one live connection per app.
 *
 * - One Socket instance, created once and reused. Before, every
 *   connectSocket() after a drop created a new io() instance, which silently
 *   dropped the listeners other screens had attached.
 * - The handshake reads the CURRENT access token on every connect and
 *   reconnect (auth callback), so a reconnect after the 15-minute token
 *   rotation no longer presents a dead token.
 * - Screens subscribe with subscribeSocketEvent(): the registry outlives the
 *   socket, so a listener added before the first connect still receives
 *   events, and conversation rooms joined earlier are joined again on every
 *   connect.
 * - About 90 s before the access token expires (server time, so a phone
 *   clock that is wrong cannot make it loop), the token is refreshed
 *   through the shared single-flight refreshAuthSession() and handed to the
 *   server with `auth:refresh`, so the connection survives the rotation.
 * - When the server says the token expired (`auth:expired`, an
 *   `io server disconnect`, or a refused handshake), the token is refreshed
 *   once and the socket connects again. A revoked session is not retried.
 *
 * The lifecycle (connect when signed in, disconnect on sign-out, reconnect on
 * foreground) belongs to RealtimeGate, mounted once in app/_layout.tsx.
 */

type SocketHandler = (...args: unknown[]) => void;
type StatusListener = (connected: boolean) => void;

/** Refresh the token this long before it expires. */
export const SOCKET_TOKEN_REFRESH_LEAD_MS = 90_000;
/** Two token refreshes are never closer together than this (a wrong phone clock). */
export const MIN_TOKEN_REFRESH_GAP_MS = 60_000;
/** Refused handshakes in a row (after refreshing) before the client stops retrying. */
const MAX_AUTH_RECOVERY_ATTEMPTS = 3;
/** Handshake refusals that a fresh token can fix. */
const RECOVERABLE_AUTH_ERRORS = new Set(['Invalid token', 'Authentication required', 'Invalid token type']);

let socket: Socket | null = null;
let stopped = true;
let recovering = false;
let authRecoveryAttempts = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Phone clock minus server clock, learned from the last freshly issued token. */
let clockOffsetMs = 0;
/** When the last token refresh for this connection succeeded (phone clock), 0 for never. */
let lastRefreshAtMs = 0;

const handlers = new Map<string, Set<SocketHandler>>();
const dispatchers = new Map<string, SocketHandler>();
const joinedRooms = new Set<string>();
const statusListeners = new Set<StatusListener>();

export function getSocket(): Socket | null {
  return socket;
}

export function isSocketConnected(): boolean {
  return socket?.connected === true;
}

function notifyStatus(connected: boolean): void {
  for (const listener of Array.from(statusListeners)) {
    try { listener(connected); } catch { /* a screen's listener must not break the others */ }
  }
}

/** Listen for connected / disconnected changes. Returns the unsubscribe. */
export function onSocketStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

function dispatcherFor(event: string): SocketHandler {
  let dispatcher = dispatchers.get(event);
  if (!dispatcher) {
    dispatcher = (...args: unknown[]): void => {
      for (const handler of Array.from(handlers.get(event) ?? [])) {
        try { handler(...args); } catch { /* one screen's handler must not break the others */ }
      }
    };
    dispatchers.set(event, dispatcher);
  }
  return dispatcher;
}

/**
 * Listen for a server event. Works before the socket exists and across every
 * reconnect. Returns the unsubscribe; it removes only this handler.
 */
export function subscribeSocketEvent<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  const list = handlers.get(event) ?? new Set<SocketHandler>();
  const first = list.size === 0;
  list.add(handler as SocketHandler);
  handlers.set(event, list);
  if (first && socket) socket.on(event, dispatcherFor(event));
  return () => {
    const current = handlers.get(event);
    if (!current) return;
    current.delete(handler as SocketHandler);
    if (current.size === 0) {
      handlers.delete(event);
      const dispatcher = dispatchers.get(event);
      if (dispatcher) socket?.off(event, dispatcher);
      dispatchers.delete(event);
    }
  };
}

/** The `exp` and `iat` (seconds, server clock) of a JWT, or null when they cannot be read. */
export function decodeJwtTimes(token: string | null | undefined): { exp: number; iat: number | null } | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = typeof globalThis.atob === 'function'
      ? globalThis.atob(padded)
      : decodeBase64(padded);
    const claims = JSON.parse(json) as { exp?: unknown; iat?: unknown };
    const exp = claims.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    const iat = typeof claims.iat === 'number' && Number.isFinite(claims.iat) && claims.iat < exp ? claims.iat : null;
    return { exp, iat };
  } catch {
    return null;
  }
}

/** The `exp` (seconds) of a JWT, or null when it cannot be read. */
export function decodeJwtExp(token: string | null | undefined): number | null {
  return decodeJwtTimes(token)?.exp ?? null;
}

function decodeBase64(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of input.replace(/=+$/, '')) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Invalid base64');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

function clearRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Learn how far the phone's clock is from the server's, from a token the
 * server has just issued (its `iat` is the server's "now").
 */
function learnClockOffset(): void {
  const times = decodeJwtTimes(getAccessToken());
  if (times?.iat != null) clockOffsetMs = Date.now() - times.iat * 1000;
}

/**
 * Arm the refresh about 90 s before the token expires, in server time. The
 * phone's clock may be wrong: the delay is measured against the server clock
 * learned from the last fresh token, can never be longer than the token's own
 * lifetime, and two refreshes are never closer than MIN_TOKEN_REFRESH_GAP_MS.
 * Before, a phone clock running 15 minutes fast made every refresh schedule
 * the next one at once, a loop of token rotations against the API's rate
 * limit.
 */
function scheduleTokenRefresh(): void {
  clearRefreshTimer();
  const times = decodeJwtTimes(getAccessToken());
  if (times === null) return;
  const serverNowMs = Date.now() - clockOffsetMs;
  let delay = times.exp * 1000 - serverNowMs - SOCKET_TOKEN_REFRESH_LEAD_MS;
  if (times.iat !== null) delay = Math.min(delay, (times.exp - times.iat) * 1000 - SOCKET_TOKEN_REFRESH_LEAD_MS);
  if (lastRefreshAtMs > 0) delay = Math.max(delay, MIN_TOKEN_REFRESH_GAP_MS - (Date.now() - lastRefreshAtMs));
  delay = Math.max(0, delay);
  refreshTimer = setTimeout(() => { void refreshSocketToken(); }, delay);
}

/** Rotate the access token and hand it to the open connection (`auth:refresh`). */
export async function refreshSocketToken(): Promise<boolean> {
  clearRefreshTimer();
  const current = socket;
  if (!current || stopped) return false;
  const rotated = await refreshAuthSession();
  if (!rotated || stopped || socket !== current) return false;
  lastRefreshAtMs = Date.now();
  learnClockOffset();
  const token = getAccessToken();
  if (!token || !current.connected) return false;
  return new Promise<boolean>((resolve) => {
    current.emit(REALTIME_CLIENT_EVENTS.AUTH_REFRESH, token, (ack?: { ok?: boolean }) => {
      if (ack?.ok) {
        scheduleTokenRefresh();
        resolve(true);
        return;
      }
      // The server follows a refusal with auth:expired and a disconnect,
      // which runs recoverAuth().
      resolve(false);
    });
  });
}

/** Refresh the token once, then connect again. Single flight. */
async function recoverAuth(): Promise<void> {
  if (recovering || stopped || !socket) return;
  if (authRecoveryAttempts >= MAX_AUTH_RECOVERY_ATTEMPTS) return;
  recovering = true;
  authRecoveryAttempts += 1;
  try {
    const rotated = await refreshAuthSession();
    if (rotated) {
      lastRefreshAtMs = Date.now();
      learnClockOffset();
    }
    if (rotated && !stopped && socket && !socket.connected) socket.connect();
  } finally {
    recovering = false;
  }
}

function handleConnect(): void {
  authRecoveryAttempts = 0;
  const current = socket;
  if (current) {
    for (const room of joinedRooms) current.emit('join:conversation', room);
  }
  scheduleTokenRefresh();
  notifyStatus(true);
}

function handleDisconnect(reason: string): void {
  clearRefreshTimer();
  notifyStatus(false);
  // The server ended the session (expired token, refused auth:refresh).
  // Socket.IO does not reconnect by itself after this reason.
  if (reason === 'io server disconnect' && !stopped) void recoverAuth();
}

function handleConnectError(error: Error): void {
  // A temporary transport failure keeps reconnecting on its own (active).
  // A refused handshake does not: refresh the token and try again, unless
  // the session itself was revoked.
  if (stopped || !socket || socket.active) return;
  if (RECOVERABLE_AUTH_ERRORS.has(error?.message)) void recoverAuth();
}

function handleAuthExpired(): void {
  if (!stopped) void recoverAuth();
}

function createSocket(): Socket {
  const created = io(platformConfig.apiUrl, {
    // Read the token at every (re)connect, never once at creation.
    auth: (cb: (data: { token: string | undefined }) => void) => cb({ token: getAccessToken() }),
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
  });
  created.on('connect', handleConnect);
  created.on('disconnect', handleDisconnect);
  created.on('connect_error', handleConnectError);
  created.on(REALTIME_EVENTS.AUTH_EXPIRED, handleAuthExpired);
  for (const event of handlers.keys()) created.on(event, dispatcherFor(event));
  return created;
}

/**
 * Connect (or keep) the one live connection. Safe to call repeatedly; it
 * never creates a second socket.
 */
export function connectSocket(): Socket {
  stopped = false;
  if (!socket) socket = createSocket();
  if (!socket.connected && !socket.active) socket.connect();
  return socket;
}

/**
 * Disconnect on sign-out or account change. The socket instance and the
 * screens' listeners are kept for the next sign-in; joined rooms are dropped
 * so the next account never rejoins the previous account's conversations.
 */
export function disconnectSocket(): void {
  stopped = true;
  recovering = false;
  authRecoveryAttempts = 0;
  clearRefreshTimer();
  joinedRooms.clear();
  if (socket) socket.disconnect();
}

export function joinConversation(conversationId: string): void {
  joinedRooms.add(conversationId);
  if (socket?.connected) socket.emit('join:conversation', conversationId);
}

export function leaveConversation(conversationId: string): void {
  joinedRooms.delete(conversationId);
  if (socket?.connected) socket.emit('leave:conversation', conversationId);
}

export function emitTypingStart(conversationId: string): void {
  if (socket?.connected) socket.emit('typing:start', conversationId);
}

export function emitTypingStop(conversationId: string): void {
  if (socket?.connected) socket.emit('typing:stop', conversationId);
}

export function emitMarkRead(conversationId: string): void {
  if (socket?.connected) socket.emit('mark:read', conversationId);
}

/** Test seam: forget the instance and every registry. */
export function __resetSocketForTests(): void {
  clearRefreshTimer();
  clockOffsetMs = 0;
  lastRefreshAtMs = 0;
  socket = null;
  stopped = true;
  recovering = false;
  authRecoveryAttempts = 0;
  handlers.clear();
  dispatchers.clear();
  joinedRooms.clear();
  statusListeners.clear();
}
