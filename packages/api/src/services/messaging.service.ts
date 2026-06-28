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
  // D26 moderation — present after migration 138; participant-facing reads
  // hide the content of a redacted message.
  redacted_at?: Date | null;
}

interface CountRow { count: string }

// MED-N140 fix: BYPASS_KEYWORDS now includes Tagalog patterns
// commonly used by providers/customers steering each other off-
// platform for a better cut. Pattern matching is whole-string
// `.includes()` (case-insensitive), so we keep these conservative
// — overly common Tagalog words like "pera" (money) would generate
// false positives in legitimate service-discussion messages.
const BYPASS_KEYWORDS = [
  // English (original list)
  'gcash', 'maya', 'direct', 'outside', 'cash', 'bank transfer',
  'personal number', 'facebook', 'messenger', 'viber', 'whatsapp',
  'telegram', 'text me', 'call me directly',
  // Tagalog additions
  'tawagan mo ako',     // "call me" (lit: you-call me)
  'i-text mo ako',      // "text me" (txt-shorthand variant)
  'text mo ako',        // bare "text me"
  'labas sa app',       // "outside the app"
  'wag mo na sa app',   // "don't use the app anymore"
  'deretso sa akin',    // "direct to me"
  'huwag mo sa app',    // formal "don't use the app"
  'sariling cellphone', // "personal cellphone"
  'sariling number',    // "personal number"
  'paypal',             // payment platform commonly suggested for bypass
  'palit-text',         // "let's switch to text"
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

  // MED-N141 fix — pre-fix: INSERT messages and UPDATE conversations
  // were two separate db.query calls. If the UPDATE failed after the
  // message INSERT committed, the conversation row's last-activity
  // timestamp went stale — affects sort order in conversation
  // listings (the "most recent" conversation could appear stuck at
  // the previous message's time).
  //
  // Post-fix: both writes run in the SAME transaction. INSERT first
  // so the trigger that maintains the message count fires (if any),
  // then UPDATE conversations.updated_at; either both land or neither.
  const result = await db.transaction(async (client) => {
    const inserted = await client.query<MessageRow>(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, is_flagged)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [conversationId, senderId, content, messageType, imageUrl ?? null, isFlagged],
    );

    await client.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    );

    return inserted;
  });

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
  // D26 — a message an admin redacted is hidden from the participants. We keep
  // the original row (the admin moderation view still shows it) but blank the
  // content + image here so neither customer nor provider can read it.
  const redacted = !!m.redacted_at;
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    content: redacted ? 'This message was removed by a moderator.' : m.content,
    messageType: redacted ? 'system' : m.message_type,
    imageUrl: redacted ? null : m.image_url,
    isRead: m.is_read,
    redacted,
    createdAt: m.created_at,
  };
}

/**
 * D26 — a participant reports a message in their own conversation. Flags it and
 * records the report so it surfaces in the admin moderation queue. Re-opens the
 * flag (flag_reviewed_at = NULL) so a freshly reported message is reviewed again
 * even if a prior auto-flag on it was already cleared.
 */
export async function reportMessage(
  messageId: string,
  reporterUserId: string,
  reason: string,
): Promise<void> {
  const result = await db.query<{ customer_id: string; provider_id: string }>(
    `SELECT c.customer_id, c.provider_id
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = $1`,
    [messageId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Message not found.', 404);
  if (row.customer_id !== reporterUserId && row.provider_id !== reporterUserId) {
    throw createAppError('You are not part of this conversation.', 403);
  }

  await db.query(
    `UPDATE messages
        SET reported_at = COALESCE(reported_at, NOW()),
            reported_by = COALESCE(reported_by, $2),
            report_reason = $3,
            is_flagged = TRUE,
            flag_reviewed_at = NULL
      WHERE id = $1`,
    [messageId, reporterUserId, (reason ?? '').trim().slice(0, 500)],
  );

  logger.warn('Message reported by participant', { messageId, reporterUserId });
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
