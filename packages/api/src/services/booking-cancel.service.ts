import type { QueryResult, QueryResultRow } from 'pg';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import type { CancellationRefund } from './commission.service';
import * as escrowService from './escrow.service';
import * as bookingOfferService from './booking-offer.service';

// S1-5 (FIN-009, FIN-010) — the cancellation core. Its shape follows the
// repair contract K07 cancelBooking, without the K01 ledger, K02 outbox and
// K08 idempotency parts, which do not exist yet. It runs on the caller's
// transaction client, after the caller has locked the booking row and run
// its actor guard and state machine. The cancellation money, the status
// fields and the provider cancellation counters then commit or roll back
// together, and the money is decided from the LOCKED escrow_status.
//
// Before S1-5 the status route committed the cancellation first and moved
// the money in a second transaction, only when an unlocked pre-read had
// seen escrow 'held'. A refused refund answered 207 with the booking
// cancelled and its escrow still held (FIN-009), and a payment that
// committed between the pre-read and the lock was never refunded (FIN-010).

export type CancellationTarget = 'cancelled_by_customer' | 'cancelled_by_provider' | 'cancelled_by_admin';

// C-20 — customers and providers derive these from the locked row. The
// admin cancel action (S1-8) passes its own audited inputs.
export interface CancellationMoneyInputs {
  hoursUntilScheduled: number;
  providerArrived: boolean;
  customerNoShow: boolean;
}

export interface LockedBookingForCancellation {
  id: string;
  status: string;
  escrow_status: string | null;
  service_fee: number | string;
  scheduled_at: Date | string | null;
}

interface CancellationClient {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
}

export interface CancellationOutcome<TRow> {
  // The cancelled row, read back after the money step, so it carries the
  // new escrow_status.
  booking: TRow;
  // null when the locked escrow was not held, so no money moved.
  refund: CancellationRefund | null;
  // S1-7 (OPS-557): pending provider offers closed with the booking.
  offersCancelled: number;
  serviceFeeCentavos: number;
  customerNoShow: boolean;
}

// The same statuses the status route used before S1-5 to decide that the
// provider had arrived.
const PROVIDER_ARRIVED_STATUSES = new Set(['provider_arrived', 'in_progress', 'completed_by_provider']);

function cancellationRefusal(code: string, message: string): Error {
  const error = createAppError(message, 409);
  error.code = code;
  return error;
}

export function isCancellationTarget(status: string): status is CancellationTarget {
  return status === 'cancelled_by_customer' || status === 'cancelled_by_provider' || status === 'cancelled_by_admin';
}

export function participantCancellationMoneyInputs(
  lockedBooking: LockedBookingForCancellation,
  nowMs: number = Date.now(),
): CancellationMoneyInputs {
  const scheduledAtMs = lockedBooking.scheduled_at ? new Date(lockedBooking.scheduled_at).getTime() : nowMs;
  return {
    hoursUntilScheduled: (scheduledAtMs - nowMs) / (1000 * 60 * 60),
    providerArrived: PROVIDER_ARRIVED_STATUSES.has(lockedBooking.status),
    customerNoShow: false,
  };
}

export async function cancelBookingInTransaction<TRow extends QueryResultRow & { provider_id: string | null }>(
  client: CancellationClient,
  input: {
    lockedBooking: LockedBookingForCancellation;
    targetStatus: CancellationTarget;
    reason?: string;
    moneyInputs: CancellationMoneyInputs;
  },
): Promise<CancellationOutcome<TRow>> {
  const { lockedBooking, targetStatus, reason, moneyInputs } = input;
  const bookingId = lockedBooking.id;

  // S1-6 (FIN-011) — escrow that has already moved. After a partial refund
  // the rest is still held for a decision nobody has made (D35 Q4). After a
  // release the provider has been paid. Cancelling either as if the money
  // were still held stranded the rest, or cancelled with no refund. The
  // wording is the interim proposal in D35 Q4 and Q11. Of the five escrow
  // states, 'pending' (never funded) and 'refunded' (nothing left) still
  // cancel without moving money, and 'held' runs the refund below.
  if (lockedBooking.escrow_status === 'partially_refunded') {
    throw cancellationRefusal(
      'BOOKING_CANCEL_PARTIALLY_REFUNDED',
      'This booking already had a partial refund. Please contact support to finish cancelling it.',
    );
  }
  if (lockedBooking.escrow_status === 'released') {
    throw cancellationRefusal(
      'BOOKING_CANCEL_ESCROW_RELEASED',
      'Payment for this booking was already released. Please contact support.',
    );
  }

  // Money first, from the locked row. Its own refusals (missing E50 terms,
  // terms mismatch, already processed, insufficient escrow) throw here and
  // roll back the whole cancellation.
  let refund: CancellationRefund | null = null;
  if (lockedBooking.escrow_status === 'held') {
    refund = await escrowService.handleCancellationInTransaction(
      client,
      bookingId,
      moneyInputs.hoursUntilScheduled,
      moneyInputs.providerArrived,
      moneyInputs.customerNoShow,
    );
  }

  const updates: string[] = [`status = $2`, `updated_at = NOW()`, `cancelled_at = NOW()`];
  const params: unknown[] = [bookingId, targetStatus];
  if (reason) {
    updates.push(`cancellation_reason = $3`);
    params.push(reason);
  }
  const result = await client.query<TRow>(
    `UPDATE bookings SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  );
  const booking = result.rows[0];
  if (!booking) throw createAppError('Booking not found.', 404);

  // MED-N68 fix — pre-fix code ran this UPDATE OUTSIDE the parent
  // transaction (`db.query` not `client.query`) and added `+ 1` to
  // the COUNT subquery. After the parent trx committed the just-
  // cancelled booking was already visible in the subquery, so the
  // `+ 1` produced double-count.
  //
  // Post-fix: UPDATE runs INSIDE the parent trx via `client.query`
  // (atomic with the booking state change). The COUNT subquery sees
  // the freshly-UPDATE'd bookings row in this same transaction
  // (READ COMMITTED + same client) so no `+ 1` is needed and the
  // count is exactly right. Errors throw and roll back the booking
  // status flip too. (S1-5: moved here unchanged from
  // booking.service transitionBookingStatus.)
  if (targetStatus === 'cancelled_by_provider' && booking.provider_id) {
    try {
      await client.query(
        `UPDATE providers
         SET total_cancellations = total_cancellations + 1,
             cancellations_last_30d = (
               SELECT COUNT(*) FROM bookings
               WHERE provider_id = $1
                 AND status = 'cancelled_by_provider'
                 AND cancelled_at > NOW() - INTERVAL '30 days'
             ),
             last_cancellation_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [booking.provider_id],
      );
    } catch (err: unknown) {
      // Re-throw — we want the booking transition to ROLL BACK if
      // we cannot record the penalty (provider count must always
      // match the bookings table).
      logger.error('Provider cancellation tracking update failed', {
        bookingId,
        providerId: booking.provider_id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      throw err;
    }
  }

  // S1-7 (OPS-557) — the booking's pending offer rows close in this
  // transaction. Before, nothing closed them: the row stayed 'pending' until
  // it expired, and the expiry sweep then tried to restart the offer cycle
  // for a cancelled booking. Not covered here (recorded in the S1-7 audit):
  // no live signal tells the provider's app the offer closed, and an offer
  // cycle that races this cancellation (kickOfferCycle, K06) can still add
  // one pending offer, which acceptOffer refuses and the sweep expires.
  const offersCancelled = await bookingOfferService.cancelOpenOffersInTransaction(client, bookingId);

  return {
    booking,
    refund,
    offersCancelled,
    serviceFeeCentavos: Number(lockedBooking.service_fee),
    customerNoShow: moneyInputs.customerNoShow,
  };
}
