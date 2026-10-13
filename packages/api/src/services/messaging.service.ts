import { db } from '../models/db';
import { createAppError, type AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';
// Namespace import with optional calls: socket events are best effort and
// several suites mock socket.service with only some of its functions.
import * as socketService from './socket.service';
import * as requestThread from './request-thread.service';
import * as jobMediaService from './job-media.service';
import { REALTIME_EVENTS } from './realtime-events';

// D38 request threads (Milestone 2, package P4). A booking can now have one
// conversation per provider: each provider who quotes gets a request thread,
// and the booked provider's thread carries on as the booking thread. The
// effective state (open or read-only) is derived in SQL by
// request-thread.service THREAD_STATE_SQL; this module enforces it on every
// participant send. Plan: qa-frameworks/human-audit-2026-10-13/merged.md
// sections 2.3 and 3 (P4), design-threads.md section 3, critique.md (P4).
//
// Import note: this module, request-thread.service and socket.service import
// each other (and job-media.service reaches socket.service through
// job-leads.service). Every cross-module reference is made inside a function,
// never at module load, so the CommonJS cycle is safe.
//
// Photo and voice messages (Milestone 2 wave 3, package W3-B): a message may
// point at a private job_media row (purpose 'chat') that its sender uploaded
// for this conversation. The send attaches it inside the send transaction
// (job-media.service attachChatMediaInTransaction) and stores media_id and,
// for voice, the server-measured media_duration_ms. Every read (the thread
// page, the legacy page, the inbox preview, the socket new:message) mints a
// fresh signed link per viewer with job-media.service createViewUrls, so a
// link is never shared between the two participants and never outlives its
// 10 minutes in a cached payload. Links are best effort on reads: if they
// cannot be signed (DATA_EXPORT_DOWNLOAD_SECRET unusable) the message still
// reads, with media.url null, and GET /api/v1/job-media/:id/url reports the
// 503 itself.

interface ConversationRow {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  // D38 (migration 185), present on rows read through the thread queries.
  state?: string;
  state_reason?: string | null;
  effective_state?: string;
  effective_state_reason?: string | null;
  stage?: string;
}

/** A conversation read for one participant: derived state, other party and context. */
export interface ConversationViewRow extends requestThread.ThreadRow {
  booking_status: string;
  other_user_id: string;
  other_first_name: string | null;
  other_last_name: string | null;
  other_avatar_url: string | null;
  other_role: 'customer' | 'provider';
  service_name: string | null;
  barangay: string | null;
  city: string | null;
}

export interface MessageRow {
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
  // D38 (migration 185).
  media_id?: string | null;
  media_duration_ms?: number | null;
  system_event?: string | null;
  client_message_id?: string | null;
}

interface CountRow { count: string }

export type ParticipantMessageType = 'text' | 'image' | 'voice' | 'location';

/** Who is reading: the participant (or admin) a signed media link is minted for. */
export type MediaViewer = jobMediaService.MediaViewer;

/** Signed links for one viewer, keyed by job_media id (createViewUrls). */
export type MediaUrlMap = ReadonlyMap<string, jobMediaService.MediaViewUrl>;

/** The `media` object on a message: what it is, and the viewer's own signed link. */
export interface MessageMediaView {
  id: string;
  kind: string | null;
  mime: string | null;
  durationMs: number | null;
  url: string | null;
  expiresAt: string | null;
}

/** job_media kind for a message type ('image' carries a photo). */
function mediaKindOfType(messageType: string | null | undefined): string | null {
  if (messageType === 'image') return 'photo';
  if (messageType === 'voice' || messageType === 'video') return messageType;
  return null;
}

/**
 * The media object for a message that points at a job_media row. The length
 * is the one stored on the message (server-measured at send); the link, mime
 * and kind come from this viewer's signed link when one was minted.
 */
export function mediaViewOf(
  row: { media_id?: string | null; media_duration_ms?: number | null; message_type?: string | null },
  urls?: MediaUrlMap,
): MessageMediaView | null {
  if (!row.media_id) return null;
  const link = urls?.get(row.media_id);
  return {
    id: row.media_id,
    kind: link?.kind ?? mediaKindOfType(row.message_type),
    mime: link?.mime ?? null,
    durationMs: row.media_duration_ms ?? link?.durationMs ?? null,
    url: link?.url ?? null,
    expiresAt: link?.expiresAt ?? null,
  };
}

/**
 * Fresh signed links for the media of these messages, minted for one viewer
 * (createViewUrls applies the viewer rule, so a participant gets links only
 * for their own conversation's media and an admin's links are audit-logged
 * as job_media_viewed). Redacted messages get no link. Best effort: a signing
 * or database failure is logged and the messages read without links.
 */
export async function mediaUrlsForViewer(
  viewer: MediaViewer,
  rows: ReadonlyArray<{ media_id?: string | null; redacted_at?: Date | null }>,
  options: { includeRedacted?: boolean } = {},
): Promise<Map<string, jobMediaService.MediaViewUrl>> {
  const ids = rows
    .filter((row) => row.media_id && (options.includeRedacted || !row.redacted_at))
    .map((row) => row.media_id!);
  if (ids.length === 0) return new Map();
  try {
    return await jobMediaService.createViewUrls(viewer, ids);
  } catch (error) {
    logger.warn('Chat media links could not be minted; messages read without them', {
      viewerId: viewer.userId,
      mediaCount: ids.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

/**
 * Signed links for both participants of a thread, each minted for that
 * participant with their stored role (the file route re-checks the viewer by
 * that role). Keyed by participant user id.
 */
async function participantMediaUrls(
  conversation: { customer_id: string; provider_id: string },
  rows: ReadonlyArray<{ media_id?: string | null; redacted_at?: Date | null }>,
): Promise<Map<string, Map<string, jobMediaService.MediaViewUrl>>> {
  const participantIds = [conversation.customer_id, conversation.provider_id];
  const roles = await db.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE id = ANY($1::uuid[])`,
    [participantIds],
  );
  const out = new Map<string, Map<string, jobMediaService.MediaViewUrl>>();
  for (const userId of participantIds) {
    const role = roles.rows.find((row) => row.id === userId)?.role;
    if (!role) continue;
    out.set(userId, await mediaUrlsForViewer({ userId, role }, rows));
  }
  return out;
}

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

function codedError(message: string, statusCode: number, code: string): AppError {
  return Object.assign(createAppError(message, statusCode), { code });
}

/** m:ss for a voice note length in milliseconds. */
function formatDuration(ms: number | null | undefined): string {
  const totalSeconds = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/**
 * The participant view query: derived state, the other party and area-only
 * context. $2 is the viewing participant's user id. Built at call time (the
 * thread SQL comes from request-thread.service; see the import note above).
 */
function viewSelectSql(extraColumns = ''): string {
  return `SELECT c.*, ${requestThread.THREAD_STATE_COLUMNS},
         b.status AS booking_status,
         CASE WHEN c.customer_id = $2 THEN c.provider_id ELSE c.customer_id END AS other_user_id,
         ou.first_name AS other_first_name, ou.last_name AS other_last_name,
         ou.avatar_url AS other_avatar_url,
         CASE WHEN c.customer_id = $2 THEN 'provider' ELSE 'customer' END AS other_role,
         COALESCE(ssc.name, sc.name) AS service_name,
         b.barangay, b.city${extraColumns}
    FROM conversations c
    ${requestThread.THREAD_STATE_JOINS}
    JOIN users ou ON ou.id = CASE WHEN c.customer_id = $2 THEN c.provider_id ELSE c.customer_id END
    LEFT JOIN service_subcategories ssc ON ssc.id = b.subcategory_id
    LEFT JOIN service_categories sc ON sc.id = b.category_id`;
}

/**
 * Legacy entry point: get or create the booked provider's conversation,
 * keyed on (booking_id, provider_id) since migration 185.
 */
export async function getOrCreateConversation(
  bookingId: string,
  customerId: string,
  providerUserId: string,
): Promise<ConversationRow> {
  const resolved = await requestThread.getOrCreateBookedThreadInTransaction(db, {
    bookingId,
    customerId,
    providerUserId,
  });
  if (resolved.created) {
    logger.info('Conversation created', { bookingId, conversationId: resolved.conversationId });
  }
  const result = await db.query<ConversationRow>(
    `SELECT * FROM conversations WHERE id = $1`,
    [resolved.conversationId],
  );
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

/**
 * One conversation as its participant sees it: derived state and stage, the
 * other party ("Ana R."), and the job's service and area (barangay and city
 * only; never the exact address). 404 for anyone else.
 */
export async function getConversationView(
  conversationId: string,
  userId: string,
): Promise<ConversationViewRow> {
  const result = await db.query<ConversationViewRow>(
    `${viewSelectSql()}
      WHERE c.id = $1 AND (c.customer_id = $2 OR c.provider_id = $2)`,
    [conversationId, userId],
  );
  const view = result.rows[0];
  if (!view) throw createAppError('Conversation not found.', 404);
  return view;
}

/** The derived state of a participant's thread (typing and other light checks). */
export async function getParticipantThreadState(
  conversationId: string,
  userId: string,
): Promise<requestThread.ThreadRow> {
  const result = await db.query<requestThread.ThreadRow>(
    `SELECT c.*, ${requestThread.THREAD_STATE_COLUMNS}
       FROM conversations c
       ${requestThread.THREAD_STATE_JOINS}
      WHERE c.id = $1 AND (c.customer_id = $2 OR c.provider_id = $2)`,
    [conversationId, userId],
  );
  const thread = result.rows[0];
  if (!thread) throw createAppError('Conversation not found.', 404);
  return thread;
}

/**
 * Legacy list (old apps find "the" chat with find(c => c.bookingId === id)),
 * so open threads come first, then most recent activity.
 */
export async function getUserConversations(userId: string): Promise<ConversationViewRow[]> {
  const result = await db.query<ConversationViewRow>(
    `${viewSelectSql()}
      WHERE (c.customer_id = $1 OR c.provider_id = $1) AND c.is_active = TRUE
      ORDER BY (${requestThread.THREAD_STATE_SQL.state} = 'open') DESC, c.updated_at DESC, c.id DESC`,
    [userId, userId],
  );
  return result.rows;
}

export interface InboxOptions {
  state?: 'open' | 'read_only' | 'all';
  bookingId?: string;
  page?: number;
  pageSize?: number;
}

interface InboxRow extends ConversationViewRow {
  total_count: string;
  unread_count: string;
  last_message_id: string | null;
  last_content: string | null;
  last_message_type: string | null;
  last_sender_id: string | null;
  last_created_at: Date | null;
  last_redacted_at: Date | null;
  last_media_duration_ms: number | null;
  last_media_id: string | null;
}

/** The inbox: one row per thread with last-message preview and unread count. */
export async function listInbox(
  userId: string,
  options: InboxOptions = {},
): Promise<{ items: InboxRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(options.pageSize) || 20)));
  const params: unknown[] = [userId, userId];
  const where = ['(c.customer_id = $1 OR c.provider_id = $1)', 'c.is_active = TRUE'];
  if (options.state === 'open' || options.state === 'read_only') {
    params.push(options.state);
    where.push(`(${requestThread.THREAD_STATE_SQL.state}) = $${params.length}`);
  }
  if (options.bookingId) {
    params.push(options.bookingId);
    where.push(`c.booking_id = $${params.length}`);
  }
  params.push(pageSize, (page - 1) * pageSize);
  const result = await db.query<InboxRow>(
    `${viewSelectSql(`,
         COUNT(*) OVER () AS total_count,
         unread_msg.count AS unread_count,
         last_msg.id AS last_message_id, last_msg.content AS last_content,
         last_msg.message_type AS last_message_type, last_msg.sender_id AS last_sender_id,
         last_msg.created_at AS last_created_at, last_msg.redacted_at AS last_redacted_at,
         last_msg.media_duration_ms AS last_media_duration_ms, last_msg.media_id AS last_media_id`)}
     LEFT JOIN LATERAL (
       SELECT m.id, m.content, m.message_type, m.sender_id, m.created_at, m.redacted_at, m.media_duration_ms,
              m.media_id
         FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
     ) last_msg ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::text AS count
         FROM messages m
        WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.is_read = FALSE
     ) unread_msg ON TRUE
     WHERE ${where.join(' AND ')}
     ORDER BY c.updated_at DESC, c.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  let total = Number(result.rows[0]?.total_count ?? 0);
  if (result.rows.length === 0 && page > 1) {
    // A page past the end returns no rows, so no window count either. Count
    // with the list's own joins and filters ($2 is the viewer, as above).
    const counted = await db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
         FROM conversations c
         ${requestThread.THREAD_STATE_JOINS}
         JOIN users ou ON ou.id = CASE WHEN c.customer_id = $2 THEN c.provider_id ELSE c.customer_id END
        WHERE ${where.join(' AND ')}`,
      params.slice(0, -2),
    );
    total = Number(counted.rows[0]?.count ?? 0);
  }
  return {
    items: result.rows,
    total,
    page,
    pageSize,
  };
}

/** Inbox preview text. Never a URL; voice shows its length. */
function previewOf(row: {
  content: string | null;
  message_type: string | null;
  redacted_at: Date | null;
  media_duration_ms: number | null;
}): string {
  if (row.redacted_at) return 'Message removed by a moderator';
  if (row.message_type === 'voice') return `Voice message (${formatDuration(row.media_duration_ms)})`;
  if (row.message_type === 'image') return 'Photo';
  return (row.content ?? '').slice(0, 120);
}

/**
 * Resolve the conversation a participant opens from a booking (POST /):
 *
 * Customer, with providerUserId: the booked provider's thread (get or create);
 *   otherwise that provider's existing thread; otherwise it is created now
 *   when the provider holds a live quote and request_threads_enabled is on
 *   (merged plan 2.3); otherwise 404 THREAD_NOT_FOUND.
 * Customer, without providerUserId: the booked provider's thread (get or
 *   create). With no provider booked: the only open thread; none gives 400,
 *   more than one gives 409 CHOOSE_THREAD.
 * Provider: their own thread. The booked provider gets it created; a provider
 *   with a quote of any status gets it created while the switch is on; no
 *   quote gives 403. Provider staff and everyone else get 403 (D30).
 */
export async function resolveConversationForParticipant(
  userId: string,
  bookingId: string,
  providerUserId?: string,
): Promise<ConversationViewRow> {
  const bookingResult = await db.query<{ customer_id: string; booked_provider_user_id: string | null }>(
    `SELECT b.customer_id, bp.user_id AS booked_provider_user_id
       FROM bookings b
       LEFT JOIN providers bp ON bp.id = b.provider_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);
  const booked = booking.booked_provider_user_id;

  const bookedThread = async (provider: string): Promise<ConversationViewRow> => {
    const resolved = await requestThread.getOrCreateBookedThreadInTransaction(db, {
      bookingId,
      customerId: booking.customer_id,
      providerUserId: provider,
    });
    if (resolved.created) {
      logger.info('Conversation created', { bookingId, conversationId: resolved.conversationId });
      const thread = await requestThread.selectThreadById(db, resolved.conversationId);
      if (thread) requestThread.emitConversationOpened(thread);
    }
    return getConversationView(resolved.conversationId, userId);
  };
  const existingThreadId = async (provider: string): Promise<string | null> => {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM conversations WHERE booking_id = $1 AND provider_id = $2`,
      [bookingId, provider],
    );
    return existing.rows[0]?.id ?? null;
  };

  if (userId === booking.customer_id) {
    if (providerUserId) {
      if (providerUserId === booked) return bookedThread(providerUserId);
      const existing = await existingThreadId(providerUserId);
      if (existing) return getConversationView(existing, userId);
      const opened = await requestThread.ensureRequestThread({
        bookingId,
        providerUserId,
        requireLiveQuote: true,
      });
      if (opened) return getConversationView(opened.conversationId, userId);
      throw codedError('There is no conversation with this pro yet.', 404, 'THREAD_NOT_FOUND');
    }
    if (booked) return bookedThread(booked);
    const open = (await requestThread.selectThreadsForBooking(db, bookingId))
      .filter((thread) => thread.effective_state === 'open');
    if (open.length === 0) throw createAppError('No provider assigned to this booking yet.', 400);
    if (open.length > 1) {
      throw codedError('Choose which pro you want to message.', 409, 'CHOOSE_THREAD');
    }
    return getConversationView(open[0]!.id, userId);
  }

  if (booked && booked === userId) return bookedThread(userId);
  const existing = await existingThreadId(userId);
  if (existing) return getConversationView(existing, userId);
  const quote = await db.query<{ id: string }>(
    `SELECT q.id
       FROM booking_quotes q
       JOIN providers p ON p.id = q.provider_id
      WHERE q.booking_id = $1 AND p.user_id = $2
      LIMIT 1`,
    [bookingId, userId],
  );
  if (!quote.rows[0]) {
    const isProvider = await db.query<{ id: string }>(
      `SELECT id FROM providers WHERE user_id = $1`,
      [userId],
    );
    if (!isProvider.rows[0]) throw createAppError('You are not part of this booking.', 403);
    throw createAppError('You can message the customer after you send a quote.', 403);
  }
  const opened = await requestThread.ensureRequestThread({
    bookingId,
    providerUserId: userId,
    requireLiveQuote: false,
  });
  if (!opened) {
    throw codedError('Messages before booking are turned off right now.', 403, 'THREADS_DISABLED');
  }
  return getConversationView(opened.conversationId, userId);
}

export interface SendParticipantMessageInput {
  conversationId: string;
  senderId: string;
  messageType?: ParticipantMessageType;
  content: string;
  mediaId?: string;
  imageUrl?: string;
  clientMessageId?: string;
}

export interface SendParticipantMessageResult {
  message: MessageRow;
  /** True when this clientMessageId was already stored; nothing new was written. */
  duplicate: boolean;
  conversation: requestThread.ThreadRow;
}

/**
 * The public bases upload.service saveUploadedFile builds photo links from:
 * UPLOAD_BASE_URL (local storage, with its default), S3_CDN_URL, and the S3
 * virtual-host address it falls back to when no CDN is set. Keep in step
 * with saveUploadedFile.
 */
function publicUploadBases(): string[] {
  const bases = [process.env.UPLOAD_BASE_URL || `http://localhost:${process.env.PORT || 7381}/uploads`];
  if (process.env.S3_CDN_URL) bases.push(process.env.S3_CDN_URL);
  if (process.env.S3_BUCKET) {
    bases.push(`https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'ap-southeast-1'}.amazonaws.com`);
  }
  return bases.map((base) => base.replace(/\/+$/, ''));
}

/**
 * Old apps (1.0.2 and 1.0.3) send booking-chat photos as a public upload link
 * (upload context 'chat'). Such a link is accepted only in a booked thread
 * (critique L9), only on one of our own upload bases, and only for the
 * sender's own chat upload (chat/<senderId>/<file id>.<jpg|png|webp>), never
 * an outside address. Request threads take private media only (wave 3).
 */
function isOwnLegacyChatUpload(imageUrl: string | undefined, senderId: string): boolean {
  if (!imageUrl) return false;
  const base = publicUploadBases().find((candidate) => imageUrl.startsWith(`${candidate}/`));
  if (!base) return false;
  const key = imageUrl.slice(base.length + 1);
  return /^chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpe?g|png|webp)$/i.test(key)
    && key.toLowerCase().startsWith(`chat/${senderId.toLowerCase()}/`);
}

/**
 * The one send path for participants (HTTP and socket). One transaction:
 *   0. a send with a mediaId first takes FOR KEY SHARE on the thread's
 *      booking row. Lock order is booking, then thread, as in the admin
 *      reassignment and support message (booking FOR UPDATE, then the
 *      thread): attaching the upload in step 4 writes job_media.booking_id,
 *      whose foreign-key check takes this same key share, and taking it only
 *      there (after the thread lock) could deadlock with those two paths
 *      (W3-B review finding 1, HA-M2-346 and 347). Key share does not block
 *      other key shares or ordinary booking UPDATEs; a booking FOR UPDATE
 *      (quote admission, decline, accept, lapse, reassignment, support
 *      message) waits for the send to commit. Text sends never touch the
 *      booking row and skip it;
 *   1. the thread row is locked (FOR NO KEY UPDATE, so two senders queue and a
 *      reassignment's state UPDATE waits) and its derived state read;
 *   2. a repeated clientMessageId returns the stored message (duplicate);
 *   3. a read-only thread refuses with 409 THREAD_READ_ONLY, before any media
 *      is touched, so a refused send leaves its upload unattached;
 *   4. a photo or voice message with a mediaId attaches that upload in this
 *      transaction (job-media.service attachChatMediaInTransaction: the
 *      sender's own stored chat upload for THIS conversation, of the message's
 *      kind, not yet sent; else 422 MEDIA_INVALID; a voice note over its
 *      length limit gets 422 VOICE_TOO_LONG). A voice message stores the
 *      server-measured length (>= 1 ms). A voice message without a mediaId is
 *      422 MEDIA_INVALID. An old app's photo URL (imageUrl, no mediaId) is
 *      accepted only in a booked thread, as before;
 *   5. any message with text (captions too) is checked for off-platform
 *      phrases;
 *   6. the message is stored at clock_timestamp() (two sends in one
 *      transaction never share a time) and the thread's activity time moves.
 *      uq_messages_media backstops "one message per upload".
 * Delivery (socket events and the push) runs after commit in
 * deliverParticipantMessage.
 */
export async function sendParticipantMessage(
  input: SendParticipantMessageInput,
): Promise<SendParticipantMessageResult> {
  const messageType: ParticipantMessageType = input.messageType ?? 'text';
  return db.transaction(async (client) => {
    if (input.mediaId) {
      // Step 0: booking before thread (see above). Same participant filter as
      // the thread lock; no row simply means the thread lookup below 404s.
      await client.query(
        `SELECT 1
           FROM bookings b
           JOIN conversations c ON c.booking_id = b.id
          WHERE c.id = $1 AND (c.customer_id = $2 OR c.provider_id = $2)
          FOR KEY SHARE OF b`,
        [input.conversationId, input.senderId],
      );
    }
    const threadResult = await client.query<requestThread.ThreadRow>(
      `SELECT c.*, ${requestThread.THREAD_STATE_COLUMNS}
         FROM conversations c
         ${requestThread.THREAD_STATE_JOINS}
        WHERE c.id = $1 AND (c.customer_id = $2 OR c.provider_id = $2)
        FOR NO KEY UPDATE OF c`,
      [input.conversationId, input.senderId],
    );
    const conversation = threadResult.rows[0];
    if (!conversation) throw createAppError('Conversation not found.', 404);

    // Participant retry keys only: system messages keep their own keys
    // (uq_messages_system_key), so a reused system key is a new message here.
    if (input.clientMessageId) {
      const prior = await client.query<MessageRow>(
        `SELECT * FROM messages
          WHERE sender_id = $1 AND client_message_id = $2 AND message_type <> 'system'`,
        [input.senderId, input.clientMessageId],
      );
      const stored = prior.rows[0];
      if (stored) {
        if (stored.conversation_id !== input.conversationId) {
          throw codedError('This message id was already used in another conversation.', 409, 'CLIENT_MESSAGE_ID_REUSED');
        }
        return { message: stored, duplicate: true, conversation };
      }
    }

    if (conversation.effective_state === 'read_only') {
      throw codedError('This conversation is read-only.', 409, 'THREAD_READ_ONLY');
    }

    let imageUrl: string | null = null;
    let mediaId: string | null = null;
    let mediaDurationMs: number | null = null;
    if (input.mediaId) {
      if (messageType !== 'image' && messageType !== 'voice') {
        throw codedError('Only photo and voice messages carry media.', 422, 'MEDIA_INVALID');
      }
      const attached = await jobMediaService.attachChatMediaInTransaction(client, {
        mediaId: input.mediaId,
        conversationId: input.conversationId,
        senderId: input.senderId,
        expectedKind: messageType === 'voice' ? 'voice' : 'photo',
      });
      mediaId = input.mediaId;
      if (messageType === 'voice') {
        // attachChatMediaInTransaction refuses a voice note with no length or
        // 0 ms; this keeps the stored value inside migration 185's 1-600000.
        if (attached.durationMs === null || attached.durationMs < 1) {
          throw codedError('This photo or voice note cannot be sent here.', 422, 'MEDIA_INVALID');
        }
        mediaDurationMs = attached.durationMs;
      }
    } else if (messageType === 'voice') {
      throw codedError('A voice message needs its recording.', 422, 'MEDIA_INVALID');
    } else if (messageType === 'image') {
      if (conversation.stage !== 'booking' || !isOwnLegacyChatUpload(input.imageUrl, input.senderId)) {
        throw codedError('This photo cannot be sent here. Update the app to send photos.', 422, 'MEDIA_INVALID');
      }
      imageUrl = input.imageUrl!;
    }

    const isFlagged = input.content.trim().length > 0 && checkPlatformBypass(input.content);

    // MED-N141 fix — the message INSERT and the conversation activity UPDATE
    // run in the SAME transaction; either both land or neither.
    const inserted = await client.query<MessageRow>(
      `INSERT INTO messages
         (conversation_id, sender_id, content, message_type, image_url, is_flagged, client_message_id,
          media_id, media_duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
       ON CONFLICT (sender_id, client_message_id)
         WHERE client_message_id IS NOT NULL AND message_type <> 'system' DO NOTHING
       RETURNING *`,
      [input.conversationId, input.senderId, input.content, messageType, imageUrl, isFlagged,
        input.clientMessageId ?? null, mediaId, mediaDurationMs],
    );
    let message = inserted.rows[0];
    if (!message) {
      // A concurrent retry with the same clientMessageId won the insert.
      const raced = await client.query<MessageRow>(
        `SELECT * FROM messages
          WHERE sender_id = $1 AND client_message_id = $2 AND message_type <> 'system'`,
        [input.senderId, input.clientMessageId ?? null],
      );
      message = raced.rows[0];
      if (!message) throw createAppError('Message could not be stored.', 500);
      // Two sends hold the same thread lock, so a same-thread retry is caught
      // by the duplicate check above; this branch is a key reused in another
      // thread at the same moment. Throwing rolls back any upload this
      // transaction attached, so an upload is never left attached with no
      // message pointing at it.
      if (message.conversation_id !== input.conversationId || (mediaId && message.media_id !== mediaId)) {
        throw codedError('This message id was already used for another message.', 409, 'CLIENT_MESSAGE_ID_REUSED');
      }
      return { message, duplicate: true, conversation };
    }

    await client.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [input.conversationId],
    );

    if (isFlagged) {
      logger.warn('Platform bypass detected in message', {
        conversationId: input.conversationId,
        senderId: input.senderId,
        messageId: message.id,
      });
    }
    return { message, duplicate: false, conversation };
  });
}

/**
 * After a participant message commits: `new:message` to the thread room,
 * `notification:message` to the other participant, and a `new_message`
 * notice whose text never carries the message ("New message from Ana R.").
 * The notice data has conversationId, bookingId and stage, plus
 * providerUserId when the recipient is the customer (so the app opens the
 * right thread). Best effort: a failure here never undoes the stored message.
 *
 * A photo or voice message carries `media` with a signed link minted for the
 * participant who receives the payload: `new:message` goes to each socket in
 * the thread room with that socket's own link (emitToConversationPerUser),
 * and `notification:message` carries the recipient's link. The notice text
 * stays "New message from ..." (never a caption or a link).
 */
export async function deliverParticipantMessage(result: SendParticipantMessageResult): Promise<void> {
  if (result.duplicate) return;
  const { message, conversation } = result;
  const senderIsCustomer = message.sender_id === conversation.customer_id;
  const recipientId = senderIsCustomer ? conversation.provider_id : conversation.customer_id;
  const participants = {
    customerId: conversation.customer_id,
    providerId: conversation.provider_id,
  };
  let formattedFor: (userId: string) => Record<string, unknown> = () => formatMessage(message, participants);
  if (message.media_id && !message.redacted_at) {
    try {
      const urlsByUser = await participantMediaUrls(conversation, [message]);
      formattedFor = (userId) => formatMessage(message, participants, urlsByUser.get(userId));
    } catch (error) {
      logger.warn('Chat media links for live delivery failed; sending without them', {
        conversationId: conversation.id,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  try {
    if (message.media_id && socketService.emitToConversationPerUser) {
      socketService.emitToConversationPerUser(conversation.id, REALTIME_EVENTS.NEW_MESSAGE, formattedFor);
    } else {
      socketService.emitToConversation?.(conversation.id, REALTIME_EVENTS.NEW_MESSAGE,
        message.media_id ? formatMessage(message, participants) : formattedFor(recipientId));
    }
    socketService.emitToUser?.(recipientId, REALTIME_EVENTS.NOTIFICATION_MESSAGE, {
      conversationId: conversation.id,
      bookingId: conversation.booking_id,
      stage: conversation.stage,
      message: formattedFor(recipientId),
    });
  } catch (error) {
    logger.warn('Chat socket delivery failed; the message is stored', {
      conversationId: conversation.id,
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const sender = await db.query<{ first_name: string | null; last_name: string | null }>(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [message.sender_id],
    );
    const displayName = requestThread.displayNameOf(
      sender.rows[0]?.first_name,
      sender.rows[0]?.last_name,
      senderIsCustomer ? 'the customer' : 'your pro',
    );
    await notificationService.createPushNotification({
      userId: recipientId,
      type: 'new_message',
      title: 'New message',
      body: `New message from ${displayName}`,
      data: {
        conversationId: conversation.id,
        bookingId: conversation.booking_id,
        stage: conversation.stage,
        ...(senderIsCustomer ? {} : { providerUserId: conversation.provider_id }),
      },
    });
  } catch (error) {
    logger.warn('Chat message notice failed; the message is stored', {
      conversationId: conversation.id,
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Legacy wrapper (text, legacy photo URL, location) kept for older callers.
 * It goes through the participant send path, so it has the read-only gate.
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  messageType: 'text' | 'image' | 'location' = 'text',
  imageUrl?: string,
): Promise<MessageRow> {
  const result = await sendParticipantMessage({
    conversationId,
    senderId,
    content,
    messageType,
    imageUrl,
  });
  return result.message;
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
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [conversationId, pageSize, offset],
  );

  return {
    messages: result.rows.reverse(),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export interface MessagesPageOptions {
  /** Messages older than this message, newest page first. */
  before?: string;
  /** Messages newer than this message. */
  after?: string;
  limit?: number;
}

/**
 * Keyset paging on (created_at, id). The result is always oldest to newest.
 * The cursor message must belong to this thread (400 otherwise). With no
 * cursor, the newest page. nextBefore is the oldest id on the page when
 * there are older messages to load.
 */
export async function getMessagesPage(
  conversationId: string,
  userId: string,
  options: MessagesPageOptions = {},
): Promise<{
  messages: MessageRow[];
  hasMore: boolean;
  nextBefore: string | null;
  conversation: ConversationViewRow;
}> {
  const conversation = await getConversationView(conversationId, userId);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit) || 30)));
  const cursor = options.before ?? options.after;
  if (cursor) {
    const exists = await db.query<{ id: string }>(
      `SELECT id FROM messages WHERE id = $1 AND conversation_id = $2`,
      [cursor, conversationId],
    );
    if (!exists.rows[0]) {
      throw codedError('That message is not in this conversation.', 400, 'CURSOR_NOT_IN_THREAD');
    }
  }

  let rows: MessageRow[];
  if (options.after) {
    const result = await db.query<MessageRow>(
      `SELECT m.* FROM messages m
        WHERE m.conversation_id = $1
          AND (m.created_at, m.id) > (SELECT created_at, id FROM messages WHERE id = $2)
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT $3`,
      [conversationId, options.after, limit + 1],
    );
    rows = result.rows;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit);
    return { messages, hasMore, nextBefore: null, conversation };
  }

  const result = options.before
    ? await db.query<MessageRow>(
      `SELECT m.* FROM messages m
        WHERE m.conversation_id = $1
          AND (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = $2)
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $3`,
      [conversationId, options.before, limit + 1],
    )
    : await db.query<MessageRow>(
      `SELECT m.* FROM messages m
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2`,
      [conversationId, limit + 1],
    );
  rows = result.rows;
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();
  return {
    messages,
    hasMore,
    nextBefore: hasMore && messages[0] ? messages[0].id : null,
    conversation,
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

/** What old apps show for a message they do not know how to draw. */
function legacyContent(m: MessageRow): string {
  if (m.message_type === 'voice') return `Voice message (${formatDuration(m.media_duration_ms)})`;
  if (m.message_type === 'image' && !m.content.trim()) return 'Photo';
  return m.content;
}

/**
 * The message shape participants get. `mediaUrls` holds the viewer's own
 * signed links (mediaUrlsForViewer); without it, or for a medium the viewer
 * may not open, `media` still names the item and its length, with url null.
 */
export function formatMessage(
  m: MessageRow,
  participants?: { customerId: string; providerId: string },
  mediaUrls?: MediaUrlMap,
): Record<string, unknown> {
  // D26 — a message an admin redacted is hidden from the participants. We keep
  // the original row (the admin moderation view still shows it) but blank the
  // content + image here so neither customer nor provider can read it.
  const redacted = !!m.redacted_at;
  const isMedia = m.message_type === 'image' || m.message_type === 'voice' || m.message_type === 'video';
  const caption = !redacted && isMedia && m.content.trim() && m.content !== 'Photo' ? m.content : null;
  let senderRole: 'customer' | 'provider' | 'support' | null = null;
  if (participants) {
    senderRole = m.sender_id === participants.customerId
      ? 'customer'
      : m.sender_id === participants.providerId ? 'provider' : 'support';
  }
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    content: redacted ? 'This message was removed by a moderator.' : legacyContent(m),
    messageType: redacted ? 'system' : m.message_type,
    imageUrl: redacted ? null : m.image_url,
    isRead: m.is_read,
    redacted,
    createdAt: m.created_at,
    // D38 fields. A redacted message never carries its media.
    caption,
    media: redacted ? null : mediaViewOf(m, mediaUrls),
    systemEvent: redacted ? null : (m.system_event ?? null),
    senderRole,
    clientMessageId: m.client_message_id ?? null,
  };
}

/**
 * D26 — a participant reports a message in their own conversation. Flags it and
 * records the report so it surfaces in the admin moderation queue. Re-opens the
 * flag (flag_reviewed_at = NULL) so a freshly reported message is reviewed again
 * even if a prior auto-flag on it was already cleared. A read-only thread can
 * still be reported.
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

/**
 * The conversation shape. Legacy fields first (old apps read only those);
 * the D38 fields are present when the row came from a thread query.
 */
export function formatConversation(c: ConversationRow | ConversationViewRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: c.id,
    bookingId: c.booking_id,
    customerId: c.customer_id,
    providerId: c.provider_id,
    isActive: c.is_active,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
  if (c.effective_state !== undefined) {
    base.state = c.effective_state;
    base.stateReason = c.effective_state_reason ?? null;
    base.stage = c.stage;
  }
  const view = c as Partial<ConversationViewRow>;
  if (view.other_user_id !== undefined) {
    base.bookingStatus = view.booking_status;
    base.otherParty = {
      userId: view.other_user_id,
      displayName: requestThread.displayNameOf(
        view.other_first_name,
        view.other_last_name,
        view.other_role === 'provider' ? 'Your pro' : 'Customer',
      ),
      avatarUrl: view.other_avatar_url ?? null,
      role: view.other_role,
    };
    base.context = {
      serviceName: view.service_name ?? null,
      barangay: view.barangay ?? null,
      city: view.city ?? null,
    };
  }
  return base;
}

/**
 * One inbox item (design-threads.md section 3). The preview text never holds
 * a link ("Photo", "Voice message (0:12)"); a media last message also carries
 * `media` with the viewer's own fresh signed link (`mediaUrls`, minted for
 * the inbox owner, who is always a participant of the listed thread).
 */
export function formatInboxItem(row: InboxRow, userId: string, mediaUrls?: MediaUrlMap): Record<string, unknown> {
  const conversation = formatConversation(row);
  return {
    id: row.id,
    bookingId: row.booking_id,
    stage: row.stage,
    state: row.effective_state,
    stateReason: row.effective_state_reason ?? null,
    otherParty: conversation.otherParty,
    service: row.service_name ?? null,
    context: conversation.context,
    bookingStatus: row.booking_status,
    lastMessage: row.last_message_id
      ? {
          preview: previewOf({
            content: row.last_content,
            message_type: row.last_message_type,
            redacted_at: row.last_redacted_at,
            media_duration_ms: row.last_media_duration_ms,
          }),
          messageType: row.last_redacted_at ? 'system' : row.last_message_type,
          senderIsMe: row.last_sender_id === userId,
          createdAt: row.last_created_at,
          media: row.last_redacted_at
            ? null
            : mediaViewOf({
              media_id: row.last_media_id,
              media_duration_ms: row.last_media_duration_ms,
              message_type: row.last_message_type,
            }, mediaUrls),
        }
      : null,
    unreadCount: Number(row.unread_count ?? 0),
    updatedAt: row.updated_at,
  };
}
