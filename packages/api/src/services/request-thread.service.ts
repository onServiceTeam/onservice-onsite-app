/**
 * D38 request threads (Milestone 2, package P4).
 *
 * Ken's human-audit notes ask for a message thread between the customer and
 * the provider who responds. D38: one thread per (request, provider); it opens
 * when that provider sends a quote, goes read-only when the quote is declined,
 * expires or is withdrawn, or another provider is booked, and the booked job
 * keeps the same thread. Plan: qa-frameworks/human-audit-2026-10-13/merged.md
 * sections 2.2 and 3 (P4), design-threads.md, and critique.md (P4 changes).
 *
 * Thread state is DERIVED in SQL from the quote and the booking
 * (THREAD_STATE_SQL). Only an admin reassignment is stored on the row
 * (conversations.state = 'read_only', state_reason = 'provider_reassigned').
 * So quote decline, quote expiry, acceptQuote and cancellation (money paths)
 * write no thread state. The hooks below run AFTER those commits, are best
 * effort and idempotent: they only post system messages and socket events. If
 * a hook never runs, the derived state still closes the thread.
 *
 * Exports used by other packages:
 *   - THREAD_STATE_SQL / THREAD_STATE_JOINS / THREAD_STATE_COLUMNS: the one
 *     place the effective state is decided (messaging, admin views).
 *   - ensureRequestThread: open the thread for a provider's quote (P2 calls it
 *     after a quote is admitted; the customer's Message button falls back to
 *     it). Throws on database errors; callers after a commit must catch.
 *   - postQuoteEvent / afterQuoteAccepted / emitThreadStatesForBooking: post
 *     commit side effects. They never throw.
 *
 * Import note: this module and messaging.service import each other. Every
 * cross-module reference is made inside a function, never at module load, so
 * the CommonJS cycle is safe.
 */
import crypto from 'node:crypto';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import * as settingsService from './settings.service';
// Namespace import with optional calls: many suites mock socket.service with
// only some of its functions, and socket events are best effort.
import * as socketService from './socket.service';
import * as messagingService from './messaging.service';
import {
  REALTIME_EVENTS,
  type ConversationOpenedPayload,
  type ConversationState,
  type ConversationStatePayload,
  type ConversationStateReason,
} from './realtime-events';

export type ThreadStage = 'request' | 'booking';

/** Anything that can run a query: db itself or a transaction client. */
export type ThreadQueryable = Pick<typeof db, 'query'>;

/** A conversations row plus its derived state (THREAD_STATE_COLUMNS). */
export interface ThreadRow {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  state?: string;
  state_reason?: string | null;
  state_changed_at?: Date | null;
  opened_by_quote_id?: string | null;
  effective_state: ConversationState;
  effective_state_reason: ConversationStateReason | null;
  stage: ThreadStage;
}

/**
 * Joins THREAD_STATE_SQL needs, written after `FROM conversations c`:
 *   b            the thread's booking
 *   bp           the booking's assigned provider (NULL before booking)
 *   thread_quote this thread provider's quote on the booking (183 allows one
 *                per provider; LIMIT 1 keeps the join safe for older rows)
 */
export const THREAD_STATE_JOINS = `
  JOIN bookings b ON b.id = c.booking_id
  LEFT JOIN providers bp ON bp.id = b.provider_id
  LEFT JOIN LATERAL (
    SELECT tq.status, tq.expires_at
      FROM booking_quotes tq
      JOIN providers tqp ON tqp.id = tq.provider_id
     WHERE tq.booking_id = c.booking_id AND tqp.user_id = c.provider_id
     ORDER BY tq.created_at DESC
     LIMIT 1
  ) thread_quote ON TRUE`;

const BOOKED_TO_ANOTHER_PROVIDER = `(b.provider_id IS NOT NULL AND bp.user_id IS DISTINCT FROM c.provider_id)`;
const NOT_BOOKED = `b.provider_id IS NULL`;

const THREAD_REASON_SQL = `CASE
    WHEN c.state = 'read_only' THEN COALESCE(c.state_reason, 'provider_reassigned')
    WHEN ${BOOKED_TO_ANOTHER_PROVIDER} THEN 'other_provider_booked'
    WHEN ${NOT_BOOKED} AND b.status IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
      THEN 'request_cancelled'
    WHEN ${NOT_BOOKED} AND thread_quote.status = 'declined' THEN 'quote_declined'
    WHEN ${NOT_BOOKED} AND thread_quote.status = 'withdrawn' THEN 'quote_withdrawn'
    WHEN ${NOT_BOOKED} AND (thread_quote.status = 'expired'
      OR (thread_quote.status = 'submitted' AND thread_quote.expires_at <= NOW())) THEN 'quote_expired'
  END`;

/**
 * The effective thread state (merged plan 2.2), as SQL expressions over the
 * aliases from THREAD_STATE_JOINS. A thread is read-only when:
 *   - it was closed by an admin reassignment (stored: provider_reassigned);
 *   - another provider is booked on the booking (other_provider_booked);
 *   - the request was cancelled with no provider booked (request_cancelled);
 *   - its provider is not booked and their quote was declined, withdrawn or
 *     has expired, including a submitted quote past expires_at that the
 *     worker has not marked yet (quote_declined, quote_withdrawn,
 *     quote_expired).
 * A booked job's own thread stays open even if the job is later cancelled or
 * completed (today's behaviour; Ken question 14). stage is 'booking' for the
 * booked provider's thread, otherwise 'request'.
 */
export const THREAD_STATE_SQL = {
  state: `CASE WHEN (${THREAD_REASON_SQL}) IS NULL THEN 'open' ELSE 'read_only' END`,
  reason: THREAD_REASON_SQL,
  stage: `CASE WHEN b.provider_id IS NOT NULL AND bp.user_id = c.provider_id THEN 'booking' ELSE 'request' END`,
} as const;

/**
 * Booking evidence filter over aliases b (bookings) and c (conversations):
 * once a provider is booked, only that provider's thread counts as the
 * booking's chat; before booking, every thread on the booking counts.
 */
export const BOOKED_THREAD_FILTER =
  `(b.provider_id IS NULL OR c.provider_id = (SELECT user_id FROM providers WHERE id = b.provider_id))`;

/** Select-list entries that give a ThreadRow its derived fields. */
export const THREAD_STATE_COLUMNS = `${THREAD_STATE_SQL.state} AS effective_state,
       ${THREAD_STATE_SQL.reason} AS effective_state_reason,
       ${THREAD_STATE_SQL.stage} AS stage`;

export type SystemEvent =
  | 'quote_sent' | 'quote_declined' | 'quote_withdrawn' | 'quote_expired'
  | 'booking_confirmed' | 'provider_reassigned_out' | 'provider_reassigned_in';

/** Decline reason labels (merged plan 2.5). The customer's free-text note is never shown. */
export const DECLINE_REASON_LABELS: Readonly<Record<string, string>> = {
  too_expensive: 'Price too high',
  timing: 'Timing did not work',
  changed_mind: 'Customer changed their mind',
  other: 'Other reason',
};

/** System message text. No price, contact detail or address ever goes into a thread. */
export const SYSTEM_MESSAGE_TEXT = {
  quote_sent: 'Sent a quote. Open the quote to see the price and time.',
  quote_expired: 'This quote expired.',
  quote_withdrawn: 'Withdrew the quote.',
  booking_confirmed: 'Confirmed the booking. Payment is the next step.',
  provider_reassigned_out: 'onService support moved this booking to another provider. This conversation is now read-only.',
  provider_reassigned_in: 'onService support assigned this booking to a new provider. You can message each other here.',
} as const;

export function quoteDeclinedText(reasonCode: string | null | undefined): string {
  const label = reasonCode ? DECLINE_REASON_LABELS[reasonCode] : undefined;
  return label ? `Declined the quote. Reason: ${label}.` : 'Declined the quote.';
}

/**
 * Deterministic UUID for a system message, stored as its client_message_id so
 * the partial unique index uq_messages_system_key (one key per thread, system
 * messages only) makes a repeated hook a no-op (the hooks run after commit and
 * may run twice). The key can be worked out from ids participants see, so it
 * must never share a unique rule with participants' own clientMessageIds
 * (uq_messages_sender_client_message excludes system messages; migration 185).
 */
export function systemMessageKey(...parts: string[]): string {
  const hex = crypto.createHash('sha256').update(`d38-thread:${parts.join(':')}`).digest('hex');
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** "Ana R." from a first and last name; fallback when both are missing. */
export function displayNameOf(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string,
): string {
  const first = (firstName ?? '').trim();
  const lastInitial = (lastName ?? '').trim().charAt(0);
  if (!first && !lastInitial) return fallback;
  if (!lastInitial) return first;
  if (!first) return `${lastInitial.toUpperCase()}.`;
  return `${first} ${lastInitial.toUpperCase()}.`;
}

/** Every thread on one booking with its derived state, oldest first. */
export async function selectThreadsForBooking(
  executor: ThreadQueryable,
  bookingId: string,
): Promise<ThreadRow[]> {
  const result = await executor.query<ThreadRow>(
    `SELECT c.*, ${THREAD_STATE_COLUMNS}
       FROM conversations c
       ${THREAD_STATE_JOINS}
      WHERE c.booking_id = $1
      ORDER BY c.created_at ASC, c.id ASC`,
    [bookingId],
  );
  return result.rows;
}

/** One thread with its derived state, or undefined. */
export async function selectThreadById(
  executor: ThreadQueryable,
  conversationId: string,
): Promise<ThreadRow | undefined> {
  const result = await executor.query<ThreadRow>(
    `SELECT c.*, ${THREAD_STATE_COLUMNS}
       FROM conversations c
       ${THREAD_STATE_JOINS}
      WHERE c.id = $1`,
    [conversationId],
  );
  return result.rows[0];
}

/**
 * Insert a system message and bump the thread's activity time. With a key the
 * insert is idempotent: a second call returns null and writes nothing.
 *
 * The thread row is locked BEFORE the message takes its time, the same order
 * as sendParticipantMessage. Every message in a thread is then stamped and
 * committed one after another, so commit order matches (created_at, id) and an
 * app catching up with `after=` never skips a system message that committed
 * after a later-stamped participant message.
 */
export async function insertSystemMessageInTransaction(
  client: ThreadQueryable,
  input: {
    conversationId: string;
    senderId: string;
    event: SystemEvent | null;
    text: string;
    key?: string | null;
  },
): Promise<messagingService.MessageRow | null> {
  await client.query(
    `SELECT 1 FROM conversations WHERE id = $1 FOR NO KEY UPDATE`,
    [input.conversationId],
  );
  const inserted = await client.query<messagingService.MessageRow>(
    `INSERT INTO messages
       (conversation_id, sender_id, content, message_type, image_url, is_flagged,
        system_event, client_message_id, created_at)
     VALUES ($1, $2, $3, 'system', NULL, FALSE, $4, $5, clock_timestamp())
     ON CONFLICT (conversation_id, client_message_id)
       WHERE client_message_id IS NOT NULL AND message_type = 'system' DO NOTHING
     RETURNING *`,
    [input.conversationId, input.senderId, input.text, input.event, input.key ?? null],
  );
  const message = inserted.rows[0];
  if (!message) return null;
  await client.query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
    [input.conversationId],
  );
  return message;
}

/**
 * Get or create the booked provider's thread. Never moves a thread to another
 * provider and never reopens one (only the admin reassignment does that).
 */
export async function getOrCreateBookedThreadInTransaction(
  client: ThreadQueryable,
  input: { bookingId: string; customerId: string; providerUserId: string },
): Promise<{ conversationId: string; created: boolean }> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO conversations (booking_id, customer_id, provider_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (booking_id, provider_id) DO NOTHING
     RETURNING id`,
    [input.bookingId, input.customerId, input.providerUserId],
  );
  if (inserted.rows[0]) return { conversationId: inserted.rows[0].id, created: true };
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM conversations WHERE booking_id = $1 AND provider_id = $2`,
    [input.bookingId, input.providerUserId],
  );
  const id = existing.rows[0]?.id;
  if (!id) throw new Error('Booked conversation could not be resolved.');
  return { conversationId: id, created: false };
}

// ─── Socket events (best effort, after commit) ──────────────────────────────

function safeEmit(action: () => void, event: string, conversationId: string): void {
  try {
    action();
  } catch (error) {
    logger.warn('Request thread socket emit failed', {
      event,
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** `conversation:state` to the thread room and both participants. */
export function emitConversationState(thread: Pick<ThreadRow,
  'id' | 'customer_id' | 'provider_id' | 'effective_state' | 'effective_state_reason'>): void {
  const payload: ConversationStatePayload = {
    conversationId: thread.id,
    state: thread.effective_state,
    stateReason: thread.effective_state_reason,
  };
  safeEmit(() => {
    socketService.emitToConversation?.(thread.id, REALTIME_EVENTS.CONVERSATION_STATE, payload);
    socketService.emitToUser?.(thread.customer_id, REALTIME_EVENTS.CONVERSATION_STATE, payload);
    socketService.emitToUser?.(thread.provider_id, REALTIME_EVENTS.CONVERSATION_STATE, payload);
  }, REALTIME_EVENTS.CONVERSATION_STATE, thread.id);
}

/** `conversation:opened` to both participants. */
export function emitConversationOpened(thread: Pick<ThreadRow,
  'id' | 'booking_id' | 'customer_id' | 'provider_id'>): void {
  const payload: ConversationOpenedPayload = {
    conversationId: thread.id,
    bookingId: thread.booking_id,
    providerUserId: thread.provider_id,
  };
  safeEmit(() => {
    socketService.emitToUser?.(thread.customer_id, REALTIME_EVENTS.CONVERSATION_OPENED, payload);
    socketService.emitToUser?.(thread.provider_id, REALTIME_EVENTS.CONVERSATION_OPENED, payload);
  }, REALTIME_EVENTS.CONVERSATION_OPENED, thread.id);
}

/**
 * A system message as a live chat message: `new:message` to the thread room
 * and `notification:message` to the participant who did not send it. System
 * messages never send a `new_message` push; the engine's own notices (new
 * quote, decline, accept) cover those events.
 */
export function emitSystemMessage(
  thread: Pick<ThreadRow, 'id' | 'booking_id' | 'customer_id' | 'provider_id' | 'stage'>,
  message: messagingService.MessageRow,
): void {
  safeEmit(() => {
    const formatted = messagingService.formatMessage(message, {
      customerId: thread.customer_id,
      providerId: thread.provider_id,
    });
    socketService.emitToConversation?.(thread.id, REALTIME_EVENTS.NEW_MESSAGE, formatted);
    for (const userId of [thread.customer_id, thread.provider_id]) {
      if (userId === message.sender_id) continue;
      socketService.emitToUser?.(userId, REALTIME_EVENTS.NOTIFICATION_MESSAGE, {
        conversationId: thread.id,
        bookingId: thread.booking_id,
        stage: thread.stage,
        message: formatted,
      });
    }
  }, REALTIME_EVENTS.NEW_MESSAGE, thread.id);
}

// ─── Lifecycle hooks ─────────────────────────────────────────────────────────

export interface EnsureRequestThreadInput {
  bookingId: string;
  /** The admitted quote (P2 passes it); otherwise the provider's quote is looked up. */
  quoteId?: string;
  /** The provider's user id (the customer's Message button passes it). */
  providerUserId?: string;
  /** Open only while the quote is live (status submitted and not past expires_at). */
  requireLiveQuote?: boolean;
}

/**
 * Open (or find) the request thread for one provider's quote and post
 * `quote_sent` from the provider. Returns null when the provider has no quote
 * on the booking (or no live quote when requireLiveQuote), or when
 * request_threads_enabled is off and no thread exists yet. An existing thread
 * is returned whatever its state. Idempotent. Throws on database errors.
 *
 * `quote_sent` and the socket notices go out only while the quote is live. A
 * provider who opens their thread from My quotes after the quote was
 * declined, expired or not selected gets it quietly: it reads read-only (the
 * derived state), and the customer gets no "Sent a quote" stamped today,
 * nothing unread and no socket event.
 */
export async function ensureRequestThread(
  input: EnsureRequestThreadInput,
): Promise<{ conversationId: string; created: boolean } | null> {
  if (!input.quoteId && !input.providerUserId) {
    throw new Error('ensureRequestThread needs a quoteId or a providerUserId.');
  }
  const outcome = await db.transaction(async (client) => {
    const quoteResult = await client.query<{
      quote_id: string;
      quote_live: boolean;
      customer_id: string;
      provider_user_id: string;
    }>(
      `SELECT q.id AS quote_id,
              (q.status = 'submitted' AND q.expires_at > NOW()) AS quote_live,
              b.customer_id, p.user_id AS provider_user_id
         FROM booking_quotes q
         JOIN bookings b ON b.id = q.booking_id
         JOIN providers p ON p.id = q.provider_id
        WHERE q.booking_id = $1
          AND ($2::uuid IS NULL OR q.id = $2::uuid)
          AND ($3::uuid IS NULL OR p.user_id = $3::uuid)
        ORDER BY q.created_at DESC
        LIMIT 1`,
      [input.bookingId, input.quoteId ?? null, input.providerUserId ?? null],
    );
    const quote = quoteResult.rows[0];
    if (!quote) return null;

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM conversations WHERE booking_id = $1 AND provider_id = $2`,
      [input.bookingId, quote.provider_user_id],
    );
    let conversationId = existing.rows[0]?.id ?? null;
    let created = false;
    if (!conversationId) {
      if (input.requireLiveQuote && !quote.quote_live) return null;
      const policy = await settingsService.getRequestPolicy();
      if (!policy.threadsEnabled) return null;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO conversations (booking_id, customer_id, provider_id, opened_by_quote_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (booking_id, provider_id) DO NOTHING
         RETURNING id`,
        [input.bookingId, quote.customer_id, quote.provider_user_id, quote.quote_id],
      );
      conversationId = inserted.rows[0]?.id ?? null;
      created = conversationId !== null;
      if (!conversationId) {
        // A concurrent call created it between the SELECT and the INSERT.
        const raced = await client.query<{ id: string }>(
          `SELECT id FROM conversations WHERE booking_id = $1 AND provider_id = $2`,
          [input.bookingId, quote.provider_user_id],
        );
        conversationId = raced.rows[0]?.id ?? null;
      }
      if (!conversationId) throw new Error('Request conversation could not be resolved.');
    }

    const message = quote.quote_live
      ? await insertSystemMessageInTransaction(client, {
        conversationId,
        senderId: quote.provider_user_id,
        event: 'quote_sent',
        text: SYSTEM_MESSAGE_TEXT.quote_sent,
        key: systemMessageKey('quote_sent', quote.quote_id),
      })
      : null;
    return { conversationId, created, message, live: quote.quote_live };
  });
  if (!outcome) return null;
  if (!outcome.live) return { conversationId: outcome.conversationId, created: outcome.created };

  try {
    const thread = await selectThreadById(db, outcome.conversationId);
    if (thread) {
      if (outcome.created) emitConversationOpened(thread);
      if (outcome.message) emitSystemMessage(thread, outcome.message);
    }
  } catch (error) {
    logger.warn('Request thread opened but its socket notice failed', {
      bookingId: input.bookingId,
      conversationId: outcome.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { conversationId: outcome.conversationId, created: outcome.created };
}

export interface PostQuoteEventInput {
  bookingId: string;
  quoteId: string;
  event: 'quote_declined' | 'quote_expired' | 'quote_withdrawn';
  /** Decline reason code; only its label is shown, never the customer's note. */
  declineReason?: string | null;
}

/**
 * After a decline, expiry or withdrawal commits: post the system message in
 * that provider's thread (if one exists) and send the thread's derived state.
 * Idempotent per quote and event. Never throws; returns whether a message was
 * stored.
 */
export async function postQuoteEvent(input: PostQuoteEventInput): Promise<boolean> {
  try {
    const outcome = await db.transaction(async (client) => {
      const found = await client.query<{
        conversation_id: string;
        customer_id: string;
        provider_user_id: string;
      }>(
        `SELECT c.id AS conversation_id, c.customer_id, c.provider_id AS provider_user_id
           FROM booking_quotes q
           JOIN providers p ON p.id = q.provider_id
           JOIN conversations c ON c.booking_id = q.booking_id AND c.provider_id = p.user_id
          WHERE q.id = $1 AND q.booking_id = $2`,
        [input.quoteId, input.bookingId],
      );
      const row = found.rows[0];
      if (!row) return null;
      const senderId = input.event === 'quote_declined' ? row.customer_id : row.provider_user_id;
      const text = input.event === 'quote_declined'
        ? quoteDeclinedText(input.declineReason)
        : SYSTEM_MESSAGE_TEXT[input.event];
      const message = await insertSystemMessageInTransaction(client, {
        conversationId: row.conversation_id,
        senderId,
        event: input.event,
        text,
        key: systemMessageKey(input.event, input.quoteId),
      });
      return { conversationId: row.conversation_id, message };
    });
    if (!outcome) return false;
    const thread = await selectThreadById(db, outcome.conversationId);
    if (thread) {
      if (outcome.message) emitSystemMessage(thread, outcome.message);
      emitConversationState(thread);
    }
    return outcome.message !== null;
  } catch (error) {
    logger.warn('Request thread quote event failed (best effort)', {
      bookingId: input.bookingId,
      quoteId: input.quoteId,
      event: input.event,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * After acceptQuote commits: make sure the booked provider's thread exists
 * (quotes sent before migration 185, or with the switch off, have none), post
 * `booking_confirmed` from the customer, and tell every thread on the booking
 * its state (the other providers' threads now read other_provider_booked).
 * Writes no state. Idempotent. Never throws.
 */
export async function afterQuoteAccepted(input: { bookingId: string }): Promise<void> {
  try {
    const outcome = await db.transaction(async (client) => {
      const booking = await client.query<{ customer_id: string; provider_user_id: string | null }>(
        `SELECT b.customer_id, bp.user_id AS provider_user_id
           FROM bookings b
           LEFT JOIN providers bp ON bp.id = b.provider_id
          WHERE b.id = $1`,
        [input.bookingId],
      );
      const row = booking.rows[0];
      if (!row?.provider_user_id) return null;
      const thread = await getOrCreateBookedThreadInTransaction(client, {
        bookingId: input.bookingId,
        customerId: row.customer_id,
        providerUserId: row.provider_user_id,
      });
      const message = await insertSystemMessageInTransaction(client, {
        conversationId: thread.conversationId,
        senderId: row.customer_id,
        event: 'booking_confirmed',
        text: SYSTEM_MESSAGE_TEXT.booking_confirmed,
        key: systemMessageKey('booking_confirmed', input.bookingId, row.provider_user_id),
      });
      return { ...thread, message };
    });
    if (!outcome) return;
    const booked = await selectThreadById(db, outcome.conversationId);
    if (booked) {
      if (outcome.created) emitConversationOpened(booked);
      if (outcome.message) emitSystemMessage(booked, outcome.message);
    }
    await emitThreadStatesForBooking(input.bookingId);
  } catch (error) {
    logger.warn('Request thread accept hook failed (best effort)', {
      bookingId: input.bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Send `conversation:state` for every thread on a booking. Never throws. */
export async function emitThreadStatesForBooking(bookingId: string): Promise<void> {
  try {
    const threads = await selectThreadsForBooking(db, bookingId);
    for (const thread of threads) emitConversationState(thread);
  } catch (error) {
    logger.warn('Request thread state emit failed (best effort)', {
      bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
