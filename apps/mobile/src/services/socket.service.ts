import { io, Socket } from 'socket.io-client';
import { platformConfig } from '@/config/platform.config';
import { storage } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = storage.getString('accessToken');
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
