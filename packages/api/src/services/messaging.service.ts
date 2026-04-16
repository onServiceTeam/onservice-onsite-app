import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface ConversationRow {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  image_url: string | null;
  is_read: boolean;
  is_flagged: boolean;
  created_at: Date;
}

interface CountRow { count: string }

const BYPASS_KEYWORDS = [
  'gcash', 'maya', 'direct', 'outside', 'cash', 'bank transfer',
  'personal number', 'facebook', 'messenger', 'viber', 'whatsapp',
  'telegram', 'text me', 'call me directly',
];

function checkPlatformBypass(content: string): boolean {
  const lower = content.toLowerCase();
  return BYPASS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export async function getOrCreateConversation(
  bookingId: string,
  customerId: string,
  providerUserId: string,
): Promise<ConversationRow> {
  const existing = await db.query<ConversationRow>(
    `SELECT * FROM conversations WHERE booking_id = $1`,
    [bookingId],
  );

  if (existing.rows.length > 0) return existing.rows[0]!;

  const result = await db.query<ConversationRow>(
    `INSERT INTO conversations (booking_id, customer_id, provider_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (booking_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [bookingId, customerId, providerUserId],
  );

  logger.info('Conversation created', { bookingId, conversationId: result.rows[0]!.id });
  return result.rows[0]!;
}

export async function getConversationById(
  conversationId: string,
  userId: string,
): Promise<ConversationRow> {
  const result = await db.query<ConversationRow>(
    `SELECT * FROM conversations
     WHERE id = $1 AND (customer_id = $2 OR provider_id = $2)`,
    [conversationId, userId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Conversation not found.', 404);
  }

  return result.rows[0]!;
}

export async function getUserConversations(userId: string): Promise<ConversationRow[]> {
  const result = await db.query<ConversationRow>(
    `SELECT c.* FROM conversations c
     WHERE (c.customer_id = $1 OR c.provider_id = $1) AND c.is_active = TRUE
     ORDER BY c.updated_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  messageType: 'text' | 'image' | 'system' | 'location' = 'text',
  imageUrl?: string,
): Promise<MessageRow> {
  await getConversationById(conversationId, senderId);

  const isFlagged = messageType === 'text' && checkPlatformBypass(content);

  const result = await db.query<MessageRow>(
    `INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, is_flagged)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [conversationId, senderId, content, messageType, imageUrl ?? null, isFlagged],
  );

  await db.query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId],
  );

  if (isFlagged) {
    logger.warn('Platform bypass detected in message', {
      conversationId,
      senderId,
      messageId: result.rows[0]!.id,
    });
  }

  return result.rows[0]!;
}

export async function getMessages(
  conversationId: string,
  userId: string,
  page = 1,
  pageSize = 50,
): Promise<{ messages: MessageRow[]; total: number }> {
  await getConversationById(conversationId, userId);

  const offset = (page - 1) * pageSize;

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM messages WHERE conversation_id = $1`,
    [conversationId],
  );

  const result = await db.query<MessageRow>(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [conversationId, pageSize, offset],
  );

  return {
    messages: result.rows.reverse(),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function markMessagesAsRead(
  conversationId: string,
  userId: string,
): Promise<number> {
  await getConversationById(conversationId, userId);

  const result = await db.query(
    `UPDATE messages SET is_read = TRUE
     WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
    [conversationId, userId],
  );

  return result.rowCount ?? 0;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE (c.customer_id = $1 OR c.provider_id = $1)
       AND m.sender_id != $1
       AND m.is_read = FALSE`,
    [userId],
  );

  return Number(result.rows[0]?.count ?? 0);
}

export function formatMessage(m: MessageRow): Record<string, unknown> {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    content: m.content,
    messageType: m.message_type,
    imageUrl: m.image_url,
    isRead: m.is_read,
    createdAt: m.created_at,
  };
}

export function formatConversation(c: ConversationRow): Record<string, unknown> {
  return {
    id: c.id,
    bookingId: c.booking_id,
    customerId: c.customer_id,
    providerId: c.provider_id,
    isActive: c.is_active,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}
