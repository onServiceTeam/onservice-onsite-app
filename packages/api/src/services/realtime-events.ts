/**
 * D38 Socket.IO event names and payload shapes for the request-first booking
 * loop (Milestone 2 plan, qa-frameworks/human-audit-2026-10-13/merged.md
 * section 2.4). The mobile app mirrors this file in
 * apps/mobile/src/config/realtime-events.ts; change both together.
 *
 * This is a leaf module with no imports, so socket.service, notification
 * service and the request services can all import it without a cycle.
 *
 * Rooms: `user:<userId>` (every authenticated socket joins its own) and
 * `conversation:<conversationId>` (joined after a participant check). Every
 * server-to-client event below is best effort and sent after the database
 * commit; the apps also poll while the live connection is down, so nothing
 * here is the only path to a state change.
 *
 * The admin dispatch-console events stay in socket.service ADMIN_EVENTS
 * (10 keys, pinned by socket-admin.test.ts); none are added for D38.
 */

/** Server-to-client events. */
export const REALTIME_EVENTS = {
  /** A request to quote on (existing name). Room: invited provider user. */
  NEW_JOB_REQUEST: 'new:job_request',
  /** The request left this provider's list. Room: provider user. */
  JOB_REQUEST_CLOSED: 'job_request:closed',
  /** A provider's quote was admitted. Room: customer user. */
  QUOTE_RECEIVED: 'quote:received',
  /** The customer declined this provider's quote. Room: provider user. */
  QUOTE_DECLINED: 'quote:declined',
  /** The customer accepted this provider's quote. Room: provider user. */
  QUOTE_ACCEPTED: 'quote:accepted',
  /** The customer chose another provider. Room: provider user. */
  QUOTE_NOT_SELECTED: 'quote:not_selected',
  /** The request's status, stage or round changed. Room: customer user. */
  REQUEST_UPDATED: 'request:updated',
  /**
   * A notification row was stored through notification.service. Room: its
   * user. Not every stored row: see NotificationNewPayload for the gaps.
   */
  NOTIFICATION_NEW: 'notification:new',
  /** A request or booking thread now exists. Rooms: customer and provider users. */
  CONVERSATION_OPENED: 'conversation:opened',
  /** A thread became open or read-only. Rooms: the conversation and both users. */
  CONVERSATION_STATE: 'conversation:state',
  /** Existing chat events (unchanged names). */
  NEW_MESSAGE: 'new:message',
  MESSAGES_READ: 'messages:read',
  /** Existing; D38 adds bookingId and stage to its payload. */
  NOTIFICATION_MESSAGE: 'notification:message',
  /** The socket's access token expired; the client refreshes and reconnects. */
  AUTH_EXPIRED: 'auth:expired',
  /** Fixed-price offer (E33 dispatch). Unchanged by D38. */
  NEW_JOB: 'new:job',
} as const;

/** Client-to-server events. */
export const REALTIME_CLIENT_EVENTS = {
  /**
   * `auth:refresh(token, ack)`: same checks as the handshake; the same userId
   * and role are required. Failure acks `{ ok: false }`, then the server sends
   * `auth:expired` and disconnects.
   */
  AUTH_REFRESH: 'auth:refresh',
} as const;

export type RealtimeEvent = typeof REALTIME_EVENTS[keyof typeof REALTIME_EVENTS];
export type RealtimeClientEvent = typeof REALTIME_CLIENT_EVENTS[keyof typeof REALTIME_CLIENT_EVENTS];

export interface JobRequestMediaCounts {
  photo: number;
  video: number;
  voice: number;
}

/** `new:job_request`. declineReason is set only on a reopened round. */
export interface NewJobRequestPayload {
  bookingId: string;
  serviceName: string;
  city: string;
  round: number;
  reopened: boolean;
  declineReason: string | null;
  mediaCounts: JobRequestMediaCounts;
}

export type JobRequestClosedReason = 'taken' | 'accepted' | 'cancelled' | 'expired';

/** `job_request:closed`. */
export interface JobRequestClosedPayload {
  bookingId: string;
  reason: JobRequestClosedReason;
}

/** `quote:received`. quotedPrice is in centavos. */
export interface QuoteReceivedPayload {
  bookingId: string;
  quoteId: string;
  providerName: string;
  quotedPrice: number;
}

/** `quote:declined`, `quote:accepted` and `quote:not_selected`. */
export interface QuoteOutcomePayload {
  bookingId: string;
  quoteId: string;
  /** Decline reason code (too_expensive, timing, changed_mind, other). */
  reason?: string;
}

export type RequestStage =
  | 'waiting'
  | 'no_pros'
  | 'quote_ready'
  | 'reopened'
  | 'payment_pending'
  | 'booked'
  | 'closed';

/** `request:updated`. opsReview is true while the back-office flag is set. */
export interface RequestUpdatedPayload {
  bookingId: string;
  status: string;
  stage: RequestStage;
  round: number;
  opsReview: boolean;
}

/**
 * `notification:new`, emitted right after a notification row is stored
 * through notification.service: createNotification(), createPushNotification()
 * (which calls it) and deliverStoredNotificationPush() (rows another service
 * stored and handed over: the dispute participant and admin dispute message
 * notices).
 *
 * It does NOT cover every row in the notifications table. Twelve older
 * insert sites write rows directly and never emit it: tips (tip.service),
 * payouts (payout.service, three), referral bonuses (referral.service, two),
 * suki rewards (suki.service), provider application decisions and account
 * actions (admin.service, four) and customer account actions
 * (customer-admin.service). So an app must keep its
 * inbox re-read (on focus and on reconnect) as the source of truth for the
 * unread count and the list, and treat this event only as a prompt to show
 * a notice or re-read sooner.
 *
 * createdAt is the stored row's time; for a row another service stored and
 * handed over without its time, it is the time of the emit.
 */
export interface NotificationNewPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  createdAt: Date | string;
}

/** `conversation:opened`. */
export interface ConversationOpenedPayload {
  conversationId: string;
  bookingId: string;
  providerUserId: string;
}

export type ConversationState = 'open' | 'read_only';

/** Why a thread is read-only (merged plan 2.2). Only provider_reassigned is stored. */
export type ConversationStateReason =
  | 'provider_reassigned'
  | 'request_cancelled'
  | 'other_provider_booked'
  | 'quote_declined'
  | 'quote_expired'
  | 'quote_withdrawn';

/** `conversation:state`. stateReason is null while the thread is open. */
export interface ConversationStatePayload {
  conversationId: string;
  state: ConversationState;
  stateReason: ConversationStateReason | null;
}
