import api from './api';
import type { ApiResponse } from './api';

export interface Conversation {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  // 'system' is sent by the server for admin/system notices and for a message
  // that a moderator redacted (the content becomes a system notice).
  messageType: 'text' | 'image' | 'location' | 'system';
  imageUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await api.get<ApiResponse<Conversation[]>>('/api/v1/conversations');
  return res.data.data;
}

export async function createConversation(bookingId: string): Promise<Conversation> {
  const res = await api.post<ApiResponse<Conversation>>('/api/v1/conversations', { bookingId });
  return res.data.data;
}

export async function getMessages(
  conversationId: string,
  page = 1,
  pageSize = 50,
): Promise<{ messages: Message[]; total: number }> {
  const res = await api.get<{
    success: boolean;
    data: Message[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }>(`/api/v1/conversations/${conversationId}/messages`, {
    params: { page, pageSize },
  });
  return { messages: res.data.data, total: res.data.meta.total };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  messageType: 'text' | 'image' | 'location' = 'text',
  imageUrl?: string,
): Promise<Message> {
  const res = await api.post<ApiResponse<Message>>(
    `/api/v1/conversations/${conversationId}/messages`,
    { content, messageType, imageUrl },
  );
  return res.data.data;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await api.post(`/api/v1/conversations/${conversationId}/read`);
}

/** Report a message to the moderation team; it surfaces in the admin queue. */
export async function reportMessage(messageId: string, reason: string): Promise<void> {
  await api.post(`/api/v1/conversations/messages/${messageId}/report`, { reason });
}

export async function getUnreadCount(): Promise<number> {
  const res = await api.get<ApiResponse<{ unreadCount: number }>>('/api/v1/conversations/unread/count');
  return res.data.data.unreadCount;
}
