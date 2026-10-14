import api from './api';
import type { ApiResponse } from './api';
import type { ConversationState, ConversationStateReason } from '@/config/realtime-events';

// D38 Milestone 2 (request threads): a booking can have one conversation per
// pro. Each pro who sends a quote gets a request thread with the customer;
// the booked pro's thread carries on as the booking thread. A thread turns
// read-only when the quote is declined, withdrawn or expires, another pro is
// booked, the request is cancelled, or the job is reassigned. Server:
// packages/api/src/routes/messaging.routes.ts (/api/v1/conversations).

export interface Conversation {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationParty {
  userId: string;
  /** First name plus last initial ("Ana R."). */
  displayName: string;
  avatarUrl: string | null;
  role: 'customer' | 'provider';
}

/** Area only (barangay and city); never the exact address before booking. */
export interface ConversationContext {
  serviceName: string | null;
  barangay: string | null;
  city: string | null;
}

/** A thread as one participant sees it (POST / and GET /:id). */
export interface ConversationView extends Conversation {
  state: ConversationState;
  stateReason: ConversationStateReason | null;
  /** 'booking' when this pro is the booked pro, otherwise 'request'. */
  stage: 'request' | 'booking';
  bookingStatus?: string;
  otherParty?: ConversationParty;
  context?: ConversationContext;
}

export interface MessageMedia {
  id: string;
  kind: 'photo' | 'voice' | 'video';
  durationMs: number | null;
  /**
   * Signed, root-relative, lives 10 minutes (see job-media.service mediaUrl).
   * null when the server could not sign a link for this viewer (it sends the
   * message without one rather than failing); the app then asks for a link
   * with GET /job-media/:id/url.
   */
  url: string | null;
  expiresAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  /**
   * Old-app text. For a media message this is the caption, 'Photo', or
   * 'Voice message (0:12)'. New screens read `caption` and `media` instead.
   */
  content: string;
  // 'system' is sent by the server for admin/system notices and for a message
  // that a moderator redacted (the content becomes a system notice).
  messageType: 'text' | 'image' | 'location' | 'system' | 'voice' | 'video';
  imageUrl: string | null;
  isRead: boolean;
  createdAt: string;
  // D38 fields (absent from servers older than Milestone 2).
  redacted?: boolean;
  caption?: string | null;
  media?: MessageMedia | null;
  systemEvent?: string | null;
  senderRole?: 'customer' | 'provider' | 'support' | null;
  clientMessageId?: string | null;
  duplicate?: boolean;
}

export interface InboxItem {
  id: string;
  bookingId: string;
  stage: 'request' | 'booking';
  state: ConversationState;
  stateReason: ConversationStateReason | null;
  otherParty: ConversationParty | null;
  service: string | null;
  context: ConversationContext | null;
  bookingStatus: string;
  lastMessage: {
    preview: string;
    messageType: string;
    senderIsMe: boolean;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface InboxPage {
  items: InboxItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface MessagesPage {
  /** Oldest to newest. */
  messages: Message[];
  hasMore: boolean;
  /** Pass as `before` to load the page of older messages. */
  nextBefore: string | null;
  conversation: { id: string; state: ConversationState; stateReason: ConversationStateReason | null } | null;
}

export type ChatMessageType = 'text' | 'image' | 'voice' | 'location';

export interface SendChatMessageInput {
  messageType: ChatMessageType;
  /** Text, or the caption of a photo or voice note (may be empty for media). */
  content: string;
  /** A private upload (job-media purpose 'chat') for photos and voice notes. */
  mediaId?: string;
  /** The sender's idempotency key: a retry with the same key stores one message. */
  clientMessageId?: string;
}

// ── D38 thread API ──

/**
 * Open the thread for a booking. A customer passes the pro's user id for a
 * request thread (created on demand while that pro holds a live quote);
 * without it the booked pro's thread opens. A pro opens their own thread.
 */
export async function openConversation(input: { bookingId: string; providerUserId?: string }): Promise<ConversationView> {
  const body: Record<string, string> = { bookingId: input.bookingId };
  if (input.providerUserId) body.providerUserId = input.providerUserId;
  const res = await api.post<ApiResponse<ConversationView>>('/api/v1/conversations', body);
  return res.data.data;
}

export async function getConversation(conversationId: string): Promise<ConversationView> {
  const res = await api.get<ApiResponse<ConversationView>>(`/api/v1/conversations/${encodeURIComponent(conversationId)}`);
  return res.data.data;
}

export async function getInbox(options: {
  state?: 'open' | 'read_only' | 'all';
  bookingId?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<InboxPage> {
  const res = await api.get<ApiResponse<InboxPage>>('/api/v1/conversations', {
    params: {
      view: 'inbox',
      state: options.state ?? 'all',
      bookingId: options.bookingId,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 20,
    },
  });
  const data = res.data?.data;
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    meta: data?.meta ?? { total: 0, page: 1, pageSize: options.pageSize ?? 20, totalPages: 0 },
  };
}

/** Keyset paging: the newest page with no cursor, older with `before`, newer with `after`. */
export async function getMessagesPage(
  conversationId: string,
  options: { before?: string; after?: string; limit?: number } = {},
): Promise<MessagesPage> {
  const res = await api.get<{
    success: boolean;
    data: Message[];
    meta?: {
      hasMore?: boolean;
      nextBefore?: string | null;
      conversation?: { id: string; state: ConversationState; stateReason: ConversationStateReason | null };
    };
  }>(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    params: { before: options.before, after: options.after, limit: options.limit ?? 30 },
  });
  return {
    messages: Array.isArray(res.data?.data) ? res.data.data : [],
    hasMore: res.data?.meta?.hasMore === true,
    nextBefore: res.data?.meta?.nextBefore ?? null,
    conversation: res.data?.meta?.conversation ?? null,
  };
}

export async function sendChatMessage(conversationId: string, input: SendChatMessageInput): Promise<Message> {
  const body: Record<string, unknown> = { messageType: input.messageType, content: input.content };
  if (input.mediaId) body.mediaId = input.mediaId;
  if (input.clientMessageId) body.clientMessageId = input.clientMessageId;
  const res = await api.post<ApiResponse<Message>>(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    body,
  );
  return res.data.data;
}

// ── Legacy API (kept for older callers) ──

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
