/**
 * D38 Milestone 2 test support: threads and messages shaped like the API's
 * /api/v1/conversations responses (packages/api messaging.service
 * formatConversation, formatMessage, formatInboxItem).
 */
import type { ConversationView, InboxItem, Message } from '../src/services/messaging.service';

export const CUSTOMER_ID = 'customer-user-1';
export const PROVIDER_USER_ID = 'provider-user-1';

export function conversationFixture(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'conversation-1',
    bookingId: 'booking-1',
    customerId: CUSTOMER_ID,
    providerId: PROVIDER_USER_ID,
    isActive: true,
    createdAt: '2026-10-14T01:00:00.000Z',
    updatedAt: '2026-10-14T01:30:00.000Z',
    state: 'open',
    stateReason: null,
    stage: 'request',
    bookingStatus: 'quoted',
    otherParty: { userId: PROVIDER_USER_ID, displayName: 'Ana R.', avatarUrl: null, role: 'provider' },
    context: { serviceName: 'Aircon repair', barangay: 'Lahug', city: 'Cebu City' },
    ...overrides,
  };
}

export function messageFixture(
  id: string,
  senderId: string,
  content: string,
  createdAt: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: 'conversation-1',
    senderId,
    content,
    messageType: 'text',
    imageUrl: null,
    isRead: false,
    createdAt,
    redacted: false,
    caption: null,
    media: null,
    systemEvent: null,
    senderRole: senderId === CUSTOMER_ID ? 'customer' : 'provider',
    clientMessageId: null,
    ...overrides,
  };
}

export function inboxItemFixture(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'conversation-1',
    bookingId: 'booking-1',
    stage: 'request',
    state: 'open',
    stateReason: null,
    otherParty: { userId: PROVIDER_USER_ID, displayName: 'Ana R.', avatarUrl: null, role: 'provider' },
    service: 'Aircon repair',
    context: { serviceName: 'Aircon repair', barangay: 'Lahug', city: 'Cebu City' },
    bookingStatus: 'quoted',
    lastMessage: { preview: 'I can come tomorrow morning.', messageType: 'text', senderIsMe: false, createdAt: '2026-10-14T01:20:00.000Z' },
    unreadCount: 0,
    updatedAt: '2026-10-14T01:20:00.000Z',
    ...overrides,
  };
}

/** One page of messages as getMessagesPage returns it. */
export function pageOf(messages: Message[], extra: { hasMore?: boolean; nextBefore?: string | null } = {}) {
  return {
    messages,
    hasMore: extra.hasMore ?? false,
    nextBefore: extra.nextBefore ?? null,
    conversation: { id: 'conversation-1', state: 'open' as const, stateReason: null },
  };
}
