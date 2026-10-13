/**
 * D38 request engine side effects (Milestone 2 plan, merged.md P2 algorithm 7,
 * sections 2.4 and 2.5, with the critique.md 2.5 additions).
 *
 * Every function here runs AFTER the database transaction that made the
 * change has committed, so a rolled-back write is never announced. Each push
 * and socket event is best effort: a failure is logged and never undoes or
 * fails the committed change, and one failed notice does not stop the next.
 * The apps also re-read on focus and poll while the live connection is down,
 * so nothing here is the only path to a state change.
 *
 * Copy rules: no message content, no contact details, and a declined amount
 * only when request_show_declined_amount is on (that rule lives in the
 * fan-out, job-leads.service).
 *
 * Request threads (Milestone 2 W3 step I2, request-thread.service): a quote
 * admitted opens its provider's thread with `quote_sent`; a decline, expiry or
 * withdrawal posts its system message in that thread and sends the thread's
 * state; an acceptance runs afterQuoteAccepted (booked thread and
 * `booking_confirmed`, sibling threads told they are read-only). Thread state
 * itself is derived from the quote and booking, so a thread hook that fails
 * never leaves a thread writable when it should not be.
 */
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { formatPHP } from '../utils/currency';
import * as notificationService from './notification.service';
import * as socketService from './socket.service';
import * as jobLeadsService from './job-leads.service';
import * as requestThreadService from './request-thread.service';
import { requestStageSql } from './booking/request-stage';
import {
  REALTIME_EVENTS,
  type QuoteOutcomePayload,
  type QuoteReceivedPayload,
  type RequestStage,
  type RequestUpdatedPayload,
} from './realtime-events';

type NotificationType = notificationService.NotificationType;

function emit(userId: string, event: string, payload: unknown): void {
  try {
    socketService.emitToUser?.(userId, event, payload);
  } catch (err) {
    logger.warn('Request event socket emit failed', { userId, event, err: String(err) });
  }
}

/**
 * Run a request-thread hook after the commit. ensureRequestThread throws on
 * database errors; the other hooks never throw by contract. Either way a
 * thread failure is logged and never fails or undoes the committed change:
 * the thread state is derived, and the customer's Message button opens a
 * missing thread lazily.
 */
async function threadHook(what: string, bookingId: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    logger.warn('Request thread hook failed', { what, bookingId, err: String(err) });
  }
}

async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await notificationService.sendPushNotification(userId, title, body, type, data);
  } catch (err) {
    logger.warn('Request event notification failed', { userId, type, err: String(err) });
  }
}

/** `request:updated` to the customer, read from the committed row. */
export async function emitRequestUpdated(bookingId: string): Promise<void> {
  try {
    const result = await db.query<{
      customer_id: string; status: string; stage: RequestStage; request_round: number; ops_review: boolean;
    }>(
      `SELECT b.customer_id, b.status, ${requestStageSql('b')} AS stage, b.request_round,
              b.request_ops_review_at IS NOT NULL AS ops_review
         FROM bookings b WHERE b.id = $1 AND b.booking_type = 'quote_based'`,
      [bookingId],
    );
    const row = result.rows[0];
    if (!row) return;
    const payload: RequestUpdatedPayload = {
      bookingId,
      status: row.status,
      stage: row.stage,
      round: Number(row.request_round),
      opsReview: row.ops_review === true,
    };
    emit(row.customer_id, REALTIME_EVENTS.REQUEST_UPDATED, payload);
  } catch (err) {
    logger.warn('request:updated emit failed', { bookingId, err: String(err) });
  }
}

/** The customer's "we're reaching out to more pros" notice for a request flagged for the back office. */
export async function opsReview(customerId: string, bookingId: string): Promise<void> {
  await notify(
    customerId,
    'request_ops_review',
    'We\'re finding more pros',
    'We\'re reaching out to more pros. Our team may contact you.',
    { bookingId },
  );
}

/** The one "still looking" notice (the worker claims each request once). */
export async function stillLooking(customerId: string, bookingId: string): Promise<void> {
  await notify(
    customerId,
    'request_still_looking',
    'Still looking',
    'We\'re still looking for a pro for your request.',
    { bookingId },
  );
  await emitRequestUpdated(bookingId);
}

/**
 * Send a request round to providers and, when round 1 finds nobody to
 * notify, tell the customer the back office is reaching out. Never throws.
 */
export async function fanOutRequest(
  bookingId: string,
  opts: jobLeadsService.FanOutOptions & { customerId?: string } = {},
): Promise<jobLeadsService.FanOutResult | null> {
  try {
    const result = await jobLeadsService.notifyProvidersOfJobRequest({ id: bookingId }, opts);
    if (result.opsReviewFlagged) {
      const customerId = opts.customerId ?? (await db.query<{ customer_id: string }>(
        `SELECT customer_id FROM bookings WHERE id = $1`, [bookingId],
      )).rows[0]?.customer_id;
      if (customerId) await opsReview(customerId, bookingId);
      await emitRequestUpdated(bookingId);
    }
    return result;
  } catch (err) {
    logger.warn('Job request fan-out failed', { bookingId, err: String(err) });
    return null;
  }
}

/** A new request was stored: send round 1. */
export async function requestCreated(booking: { id: string; customer_id: string }): Promise<void> {
  await fanOutRequest(booking.id, { round: 1, customerId: booking.customer_id });
}

export interface QuoteAdmittedEvent {
  bookingId: string;
  quoteId: string;
  customerId: string;
  providerName: string;
  serviceName: string;
  quotedPrice: number;
  /** Invited providers whose invites became 'taken'. */
  takenProviderUserIds: string[];
}

/**
 * A quote was admitted: open the provider's request thread, tell the
 * customer, and close the request for the other invitees at the cap. The
 * thread opens first so the customer's quote card already carries its
 * conversationId when the notice arrives.
 */
export async function quoteAdmitted(event: QuoteAdmittedEvent): Promise<void> {
  await threadHook('quote_sent', event.bookingId, () => requestThreadService.ensureRequestThread({
    bookingId: event.bookingId,
    quoteId: event.quoteId,
    requireLiveQuote: true,
  }));
  await notify(
    event.customerId,
    'new_quote',
    `New quote from ${event.providerName}`,
    `${event.providerName} quoted ${formatPHP(event.quotedPrice)} for ${event.serviceName}. Tap to review.`,
    { bookingId: event.bookingId, quoteId: event.quoteId },
  );
  const received: QuoteReceivedPayload = {
    bookingId: event.bookingId,
    quoteId: event.quoteId,
    providerName: event.providerName,
    quotedPrice: event.quotedPrice,
  };
  emit(event.customerId, REALTIME_EVENTS.QUOTE_RECEIVED, received);
  for (const userId of event.takenProviderUserIds) {
    emit(userId, REALTIME_EVENTS.JOB_REQUEST_CLOSED, { bookingId: event.bookingId, reason: 'taken' });
  }
  await emitRequestUpdated(event.bookingId);
}

export interface QuoteDeclinedEvent {
  bookingId: string;
  quoteId: string;
  customerId: string;
  providerUserId: string;
  serviceName: string;
  reason: string;
  declinedAmount: number;
  reopened: boolean;
  round: number;
  opsReviewFlagged: boolean;
}

/**
 * The customer declined a quote: tell that provider (with the reason label,
 * never the note), send a reopened round to other providers, and tell the
 * customer what happened next.
 */
export async function quoteDeclined(event: QuoteDeclinedEvent): Promise<void> {
  // The thread message carries the reason label only, never the note.
  await threadHook('quote_declined', event.bookingId, () => requestThreadService.postQuoteEvent({
    bookingId: event.bookingId,
    quoteId: event.quoteId,
    event: 'quote_declined',
    declineReason: event.reason,
  }));
  const label = jobLeadsService.declineReasonLabel(event.reason) ?? 'Other reason';
  if (event.providerUserId) {
    await notify(
      event.providerUserId,
      'quote_declined',
      'Quote declined',
      `The customer declined your quote for ${event.serviceName}. Reason: ${label}.`,
      { bookingId: event.bookingId, quoteId: event.quoteId, reason: event.reason },
    );
    const declined: QuoteOutcomePayload = { bookingId: event.bookingId, quoteId: event.quoteId, reason: event.reason };
    emit(event.providerUserId, REALTIME_EVENTS.QUOTE_DECLINED, declined);
  }
  if (event.reopened) {
    const fanOut = await fanOutRequest(event.bookingId, {
      round: event.round,
      customerId: event.customerId,
      reopened: { declineReason: event.reason, declinedAmount: event.declinedAmount },
    });
    // Only claim "sent to more pros" when the new round actually reached someone.
    if (fanOut && fanOut.invited > 0) {
      await notify(
        event.customerId,
        'request_reopened',
        'Request sent to more pros',
        'We\'ve sent your request to more pros.',
        { bookingId: event.bookingId },
      );
    }
  }
  if (event.opsReviewFlagged) await opsReview(event.customerId, event.bookingId);
  await emitRequestUpdated(event.bookingId);
}

export interface QuoteAcceptedEvent {
  bookingId: string;
  quoteId: string;
  /** providers.id of the accepted quote. */
  winnerProviderId: string;
  /** Sibling quotes acceptQuote closed (providers.id). */
  notSelected: Array<{ quoteId: string; providerId: string }>;
}

/**
 * The customer accepted a quote: make sure the booked thread exists and post
 * `booking_confirmed` in it (the other providers' threads are told they are
 * now read-only), tell the winner and the others, and close every open invite.
 */
export async function quoteAccepted(event: QuoteAcceptedEvent): Promise<void> {
  await threadHook('booking_confirmed', event.bookingId,
    () => requestThreadService.afterQuoteAccepted({ bookingId: event.bookingId }));
  let serviceName = 'your request';
  const userByProvider = new Map<string, string>();
  try {
    const providerIds = [event.winnerProviderId, ...event.notSelected.map((s) => s.providerId)];
    const people = await db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM providers WHERE id = ANY($1::uuid[])`,
      [providerIds],
    );
    for (const row of people.rows) userByProvider.set(row.id, row.user_id);
    const service = await db.query<{ service_name: string }>(
      `SELECT COALESCE(sub.name, sc.name, 'your request') AS service_name
         FROM bookings b
         LEFT JOIN service_categories sc ON sc.id = b.category_id
         LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
        WHERE b.id = $1`,
      [event.bookingId],
    );
    serviceName = service.rows[0]?.service_name ?? serviceName;
  } catch (err) {
    logger.warn('Reading quote acceptance recipients failed', { bookingId: event.bookingId, err: String(err) });
  }

  const winnerUserId = userByProvider.get(event.winnerProviderId);
  if (winnerUserId) {
    await notify(
      winnerUserId,
      'quote_accepted',
      'Quote accepted',
      'Accepted. You get the job once they pay.',
      { bookingId: event.bookingId, quoteId: event.quoteId },
    );
    const accepted: QuoteOutcomePayload = { bookingId: event.bookingId, quoteId: event.quoteId };
    emit(winnerUserId, REALTIME_EVENTS.QUOTE_ACCEPTED, accepted);
  }
  for (const sibling of event.notSelected) {
    const userId = userByProvider.get(sibling.providerId);
    if (!userId) continue;
    await notify(
      userId,
      'quote_not_selected',
      'Customer chose another pro',
      `The customer chose another pro for ${serviceName}.`,
      { bookingId: event.bookingId, quoteId: sibling.quoteId },
    );
    const notSelected: QuoteOutcomePayload = { bookingId: event.bookingId, quoteId: sibling.quoteId };
    emit(userId, REALTIME_EVENTS.QUOTE_NOT_SELECTED, notSelected);
  }
  try {
    await jobLeadsService.closeRequest(event.bookingId, 'accepted');
  } catch (err) {
    logger.warn('Closing invites after acceptance failed', { bookingId: event.bookingId, err: String(err) });
  }
  await emitRequestUpdated(event.bookingId);
}

export interface QuoteWithdrawnEvent {
  bookingId: string;
  quoteId: string;
  customerId: string;
  providerName: string;
  reopened: boolean;
  round: number;
  opsReviewFlagged: boolean;
}

/** A provider withdrew their quote: post it in their thread, send a reopened round out, then tell the customer. */
export async function quoteWithdrawn(event: QuoteWithdrawnEvent): Promise<void> {
  await threadHook('quote_withdrawn', event.bookingId, () => requestThreadService.postQuoteEvent({
    bookingId: event.bookingId,
    quoteId: event.quoteId,
    event: 'quote_withdrawn',
  }));
  let reachedMorePros = false;
  if (event.reopened) {
    const fanOut = await fanOutRequest(event.bookingId, {
      round: event.round,
      customerId: event.customerId,
      reopened: { declineReason: null, declinedAmount: null },
    });
    reachedMorePros = (fanOut?.invited ?? 0) > 0;
  }
  await notify(
    event.customerId,
    'quote_withdrawn',
    'Quote withdrawn',
    reachedMorePros
      ? `${event.providerName} withdrew their quote. We've sent your request to more pros.`
      : `${event.providerName} withdrew their quote.`,
    { bookingId: event.bookingId, quoteId: event.quoteId },
  );
  if (event.opsReviewFlagged) await opsReview(event.customerId, event.bookingId);
  await emitRequestUpdated(event.bookingId);
}

/**
 * A live quote on an open request lapsed (the expiry worker): post
 * `quote_expired` in that provider's thread and send the thread's state.
 * Idempotent per quote; never throws.
 */
export async function quoteExpired(event: { bookingId: string; quoteId: string }): Promise<void> {
  await threadHook('quote_expired', event.bookingId, () => requestThreadService.postQuoteEvent({
    bookingId: event.bookingId,
    quoteId: event.quoteId,
    event: 'quote_expired',
  }));
}

export interface RequestLapsedEvent {
  bookingId: string;
  customerId: string;
  round: number;
  reopened: boolean;
  opsReviewFlagged: boolean;
  /** Providers whose quotes just lapsed (names for the customer's notice). */
  providerNames: string[];
}

/**
 * The last live quote lapsed and the request reopened (critique M3): tell
 * the customer and send the new round to other providers. Not called for a
 * legacy row (that reopens silently).
 */
export async function requestLapsed(event: RequestLapsedEvent): Promise<void> {
  const body = event.providerNames.length === 1
    ? `Your quote from ${event.providerNames[0]} expired. We've reopened your request.`
    : 'Your quotes expired. We\'ve reopened your request.';
  await notify(event.customerId, 'quote_expired', 'Quote expired', body, { bookingId: event.bookingId });
  if (event.reopened) {
    await fanOutRequest(event.bookingId, {
      round: event.round,
      customerId: event.customerId,
      reopened: { declineReason: null, declinedAmount: null },
    });
  }
  if (event.opsReviewFlagged) await opsReview(event.customerId, event.bookingId);
  await emitRequestUpdated(event.bookingId);
}
