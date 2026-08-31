/**
 * Admin chat moderation (D26 step 1).
 *
 * The participant-facing messaging service (messaging.service.ts) scopes every
 * read to the two people in the conversation. Admins legitimately need to see
 * customer<->provider chats to investigate disputes and off-platform-bypass
 * attempts, so this service deliberately reads WITHOUT the participant filter.
 * It is mounted only under /api/v1/admin/* behind requireAdmin, and every
 * sensitive action (opening a thread, redacting, resolving a flag) writes an
 * admin_actions audit row.
 *
 * Designed as the "Communications" moderation surface so future call logs +
 * transcripts attach to the same conversations/booking spine.
 */
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

const PREVIEW_LEN = 120;
const REDACTION_REASON_MIN = 3;
const REVIEW_NOTE_MIN = 3;
const MODERATION_REASON_MAX = 2000;

interface AdminMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  image_url: string | null;
  is_read: boolean;
  is_flagged: boolean;
  flag_reviewed_at: Date | null;
  reported_at: Date | null;
  report_reason: string | null;
  redacted_at: Date | null;
  redacted_by: string | null;
  redaction_reason: string | null;
  created_at: Date;
  sender_first: string;
  sender_last: string;
  sender_role: string;
}

function formatAdminMessage(m: AdminMessageRow): Record<string, unknown> {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    senderName: `${m.sender_first} ${m.sender_last}`.trim(),
    senderRole: m.sender_role,
    // Admins see the original content even when redacted, so they can judge
    // the redaction; the participant-facing API hides it (see messaging.service).
    content: m.content,
    messageType: m.message_type,
    imageUrl: m.image_url,
    isRead: m.is_read,
    isFlagged: m.is_flagged,
    flagReviewedAt: m.flag_reviewed_at ? m.flag_reviewed_at.toISOString() : null,
    reportedAt: m.reported_at ? m.reported_at.toISOString() : null,
    reportReason: m.report_reason,
    redactedAt: m.redacted_at ? m.redacted_at.toISOString() : null,
    redactedBy: m.redacted_by,
    redactionReason: m.redaction_reason,
    createdAt: m.created_at.toISOString(),
  };
}

/** Records an admin moderation action against the conversation's booking. */
async function logModerationAction(
  executor: Pick<typeof db, 'query'>,
  adminId: string,
  actionType: 'conversation_viewed' | 'message_redacted' | 'message_flag_reviewed',
  bookingId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await executor.query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
     VALUES ($1, $2, 'booking', $3, $4::jsonb)`,
    [adminId, actionType, bookingId, JSON.stringify(details)],
  );
}

// ─── Conversation list ───────────────────────────────────────────────────────

export interface ListConversationsOpts {
  filter?: 'all' | 'flagged' | 'reported';
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listConversationsForAdmin(opts: ListConversationsOpts): Promise<{
  conversations: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.filter === 'flagged') {
    where.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.is_flagged = TRUE AND m.flag_reviewed_at IS NULL)`,
    );
  } else if (opts.filter === 'reported') {
    where.push(
      `EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.reported_at IS NOT NULL AND m.flag_reviewed_at IS NULL)`,
    );
  }

  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(
      `(cu.first_name ILIKE ${p} OR cu.last_name ILIKE ${p} OR pu.first_name ILIKE ${p} OR pu.last_name ILIKE ${p} OR c.booking_id::text ILIKE ${p})`,
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM conversations c
       JOIN users cu ON cu.id = c.customer_id
       JOIN users pu ON pu.id = c.provider_id
       ${whereSql}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(pageSize, offset);
  const rows = await db.query<{
    id: string;
    booking_id: string;
    customer_id: string;
    provider_id: string;
    provider_profile_id: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    customer_first: string;
    customer_last: string;
    provider_first: string;
    provider_last: string;
    message_count: string;
    flagged_open: string;
    reported_open: string;
    last_message_at: Date | null;
    last_message_preview: string | null;
  }>(
    `SELECT c.id, c.booking_id, c.customer_id, c.provider_id,
            p.id AS provider_profile_id, c.is_active,
            c.created_at, c.updated_at,
            cu.first_name AS customer_first, cu.last_name AS customer_last,
            pu.first_name AS provider_first, pu.last_name AS provider_last,
            stats.message_count, stats.flagged_open, stats.reported_open,
            stats.last_message_at, stats.last_message_preview
       FROM conversations c
       JOIN users cu ON cu.id = c.customer_id
       JOIN users pu ON pu.id = c.provider_id
       LEFT JOIN providers p ON p.user_id = c.provider_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::text AS message_count,
                COUNT(*) FILTER (WHERE m.is_flagged = TRUE AND m.flag_reviewed_at IS NULL)::text AS flagged_open,
                COUNT(*) FILTER (WHERE m.reported_at IS NOT NULL AND m.flag_reviewed_at IS NULL)::text AS reported_open,
                MAX(m.created_at) AS last_message_at,
                (SELECT content FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1) AS last_message_preview
           FROM messages m WHERE m.conversation_id = c.id
       ) stats ON TRUE
       ${whereSql}
       ORDER BY c.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const conversations = rows.rows.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    customerId: r.customer_id,
    customerName: `${r.customer_first} ${r.customer_last}`.trim(),
    providerId: r.provider_id,
    providerProfileId: r.provider_profile_id,
    providerName: `${r.provider_first} ${r.provider_last}`.trim(),
    isActive: r.is_active,
    messageCount: Number(r.message_count ?? 0),
    flaggedOpen: Number(r.flagged_open ?? 0),
    reportedOpen: Number(r.reported_open ?? 0),
    lastMessageAt: r.last_message_at ? r.last_message_at.toISOString() : null,
    lastMessagePreview: r.last_message_preview
      ? r.last_message_preview.slice(0, PREVIEW_LEN)
      : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));

  return { conversations, total, page, pageSize };
}

// ─── Single conversation thread (audit-logged) ───────────────────────────────

export async function getConversationThreadForAdmin(
  conversationId: string,
  adminId: string,
): Promise<Record<string, unknown>> {
  const thread = await db.transaction(async (client) => {
    const convResult = await client.query<{
      id: string;
      booking_id: string;
      customer_id: string;
      provider_id: string;
      provider_profile_id: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
      customer_first: string;
      customer_last: string;
      provider_first: string;
      provider_last: string;
    }>(
      `SELECT c.id, c.booking_id, c.customer_id, c.provider_id,
            p.id AS provider_profile_id, c.is_active,
            c.created_at, c.updated_at,
            cu.first_name AS customer_first, cu.last_name AS customer_last,
            pu.first_name AS provider_first, pu.last_name AS provider_last
       FROM conversations c
       JOIN users cu ON cu.id = c.customer_id
       JOIN users pu ON pu.id = c.provider_id
       LEFT JOIN providers p ON p.user_id = c.provider_id
      WHERE c.id = $1`,
      [conversationId],
    );
    const conv = convResult.rows[0];
    if (!conv) throw createAppError('Conversation not found.', 404);

    const messages = await client.query<AdminMessageRow>(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type, m.image_url,
            m.is_read, m.is_flagged, m.flag_reviewed_at, m.reported_at, m.report_reason,
            m.redacted_at, m.redacted_by, m.redaction_reason, m.created_at,
            su.first_name AS sender_first, su.last_name AS sender_last, su.role AS sender_role
       FROM messages m
       JOIN users su ON su.id = m.sender_id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC`,
      [conversationId],
    );

    // Reading the private thread is a PII access. Do not return it unless the
    // access ledger write succeeds in the same transaction.
    await logModerationAction(client, adminId, 'conversation_viewed', conv.booking_id, {
      conversationId,
    });

    return {
      bookingId: conv.booking_id,
      result: {
        id: conv.id,
        bookingId: conv.booking_id,
        customerId: conv.customer_id,
        customerName: `${conv.customer_first} ${conv.customer_last}`.trim(),
        providerId: conv.provider_id,
        providerProfileId: conv.provider_profile_id,
        providerName: `${conv.provider_first} ${conv.provider_last}`.trim(),
        isActive: conv.is_active,
        createdAt: conv.created_at.toISOString(),
        updatedAt: conv.updated_at.toISOString(),
        messages: messages.rows.map(formatAdminMessage),
      },
    };
  });
  logger.info('Admin viewed conversation', {
    adminId,
    conversationId,
    bookingId: thread.bookingId,
  });
  return thread.result;
}

// ─── Review queue (flagged + reported, not yet handled) ──────────────────────

export async function listModerationQueue(opts: {
  scope?: 'all' | 'flagged' | 'reported';
  page?: number;
  pageSize?: number;
}): Promise<{
  messages: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  let condition: string;
  if (opts.scope === 'flagged') {
    condition = `m.is_flagged = TRUE AND m.flag_reviewed_at IS NULL`;
  } else if (opts.scope === 'reported') {
    condition = `m.reported_at IS NOT NULL AND m.flag_reviewed_at IS NULL`;
  } else {
    condition = `(m.is_flagged = TRUE OR m.reported_at IS NOT NULL) AND m.flag_reviewed_at IS NULL`;
  }

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages m WHERE ${condition}`,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const rows = await db.query<AdminMessageRow & { booking_id: string }>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type, m.image_url,
            m.is_read, m.is_flagged, m.flag_reviewed_at, m.reported_at, m.report_reason,
            m.redacted_at, m.redacted_by, m.redaction_reason, m.created_at,
            su.first_name AS sender_first, su.last_name AS sender_last, su.role AS sender_role,
            c.booking_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN users su ON su.id = m.sender_id
      WHERE ${condition}
      ORDER BY m.created_at DESC
      LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  );

  const messages = rows.rows.map((m) => ({
    ...formatAdminMessage(m),
    bookingId: m.booking_id,
  }));

  return { messages, total, page, pageSize };
}

export async function getModerationStats(): Promise<{ openFlagged: number; openReported: number }> {
  const result = await db.query<{ open_flagged: string; open_reported: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE is_flagged = TRUE AND flag_reviewed_at IS NULL)::text AS open_flagged,
       COUNT(*) FILTER (WHERE reported_at IS NOT NULL AND flag_reviewed_at IS NULL)::text AS open_reported
     FROM messages`,
  );
  const r = result.rows[0];
  return {
    openFlagged: Number(r?.open_flagged ?? 0),
    openReported: Number(r?.open_reported ?? 0),
  };
}

// ─── Moderation actions ──────────────────────────────────────────────────────

/** Soft-hide a message from the participants; keeps original content for audit. */
export async function redactMessage(
  messageId: string,
  adminId: string,
  reason: string,
): Promise<Record<string, unknown>> {
  const trimmed = (reason ?? '').trim();
  if (trimmed.length < REDACTION_REASON_MIN) {
    throw createAppError(
      `A redaction reason of at least ${REDACTION_REASON_MIN} characters is required.`,
      400,
    );
  }
  if (trimmed.length > MODERATION_REASON_MAX) {
    throw createAppError(`Redaction reason must be at most ${MODERATION_REASON_MAX} characters.`, 400);
  }

  const message = await db.transaction(async (client) => {
    const bookingResult = await client.query<{ booking_id: string; already: Date | null }>(
      `SELECT c.booking_id, m.redacted_at AS already
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = $1`,
      [messageId],
    );
    const row = bookingResult.rows[0];
    if (!row) throw createAppError('Message not found.', 404);
    if (row.already) {
      throw createAppError('Message is already redacted. The original moderation decision is immutable.', 409);
    }

    const updated = await client.query<AdminMessageRow>(
      `UPDATE messages
          SET redacted_at = NOW(),
              redacted_by = $2,
              redaction_reason = $3,
              flag_reviewed_at = COALESCE(flag_reviewed_at, NOW()),
              flag_reviewed_by = COALESCE(flag_reviewed_by, $2)
        WHERE id = $1
        RETURNING id, conversation_id, sender_id, content, message_type, image_url,
                  is_read, is_flagged, flag_reviewed_at, reported_at, report_reason,
                  redacted_at, redacted_by, redaction_reason, created_at,
                  '' AS sender_first, '' AS sender_last, '' AS sender_role`,
      [messageId, adminId, trimmed],
    );

    await logModerationAction(client, adminId, 'message_redacted', row.booking_id, {
      messageId,
      reason: trimmed,
      alreadyRedacted: row.already !== null,
    });
    return formatAdminMessage(updated.rows[0]!);
  });
  logger.info('Admin redacted message', { adminId, messageId });
  return message;
}

/** Mark an auto-flag or user report as reviewed/handled (clears it from the queue). */
export async function reviewFlag(
  messageId: string,
  adminId: string,
  reviewNote: string,
): Promise<{ reviewed: boolean }> {
  const trimmedNote = (reviewNote ?? '').trim();
  if (trimmedNote.length < REVIEW_NOTE_MIN) {
    throw createAppError(
      `A review rationale of at least ${REVIEW_NOTE_MIN} characters is required.`,
      400,
    );
  }
  if (trimmedNote.length > MODERATION_REASON_MAX) {
    throw createAppError(`Review rationale must be at most ${MODERATION_REASON_MAX} characters.`, 400);
  }

  await db.transaction(async (client) => {
    const lookup = await client.query<{
      booking_id: string;
      is_flagged: boolean;
      reported_at: Date | null;
      flag_reviewed_at: Date | null;
    }>(
      `SELECT c.booking_id, m.is_flagged, m.reported_at, m.flag_reviewed_at
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = $1`,
      [messageId],
    );
    const row = lookup.rows[0];
    if (!row) throw createAppError('Message not found.', 404);
    if (!row.is_flagged && !row.reported_at) {
      throw createAppError('Message has no open flag or user report to review.', 409);
    }
    if (row.flag_reviewed_at) {
      throw createAppError('Message report is already reviewed. The original decision is immutable.', 409);
    }

    await client.query(
      `UPDATE messages
          SET flag_reviewed_at = NOW(),
              flag_reviewed_by = $2
        WHERE id = $1`,
      [messageId, adminId],
    );

    await logModerationAction(client, adminId, 'message_flag_reviewed', row.booking_id, {
      messageId,
      reviewNote: trimmedNote,
    });
  });
  logger.info('Admin reviewed message flag', { adminId, messageId });

  return { reviewed: true };
}
