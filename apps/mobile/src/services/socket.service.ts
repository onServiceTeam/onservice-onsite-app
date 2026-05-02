import { io, Socket } from 'socket.io-client';
import { platformConfig } from '@/config/platform.config';
// Phase K CRIT-K04 fix — read access token from the canonical
// secure-storage (per-device keychain-backed encryption key) NOT
// the legacy `storage` MMKV instance. Pre-fix the socket connected
// with `auth.token = undefined` because the access token had been
// migrated to the new secure-storage module long ago — this file
// was still reading from the empty legacy bucket. Result: server
// rejected every socket connection, real-time chat / messaging /
// new-job-modal silently broken in production.
import { getAccessToken } from './secure-storage';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = getAccessToken();
  socket = io(platformConfig.apiUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinConversation(conversationId: string): void {
  socket?.emit('join:conversation', conversationId);
}

export function leaveConversation(conversationId: string): void {
  socket?.emit('leave:conversation', conversationId);
}

export function emitTypingStart(conversationId: string): void {
  socket?.emit('typing:start', conversationId);
}

export function emitTypingStop(conversationId: string): void {
  socket?.emit('typing:stop', conversationId);
}

export function emitMarkRead(conversationId: string): void {
  socket?.emit('mark:read', conversationId);
}
