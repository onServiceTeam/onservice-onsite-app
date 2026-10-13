/**
 * D38 (Milestone 2 plan, merged.md section 2.2 and P2 algorithm 6): the
 * customer-facing stage of a quote request, worked out in SQL from the
 * booking row and its live quotes. GET /bookings/:id/request-status and the
 * customer's booking list (listBookings) use the same fragment, so the
 * request screen and the Bookings tab never disagree.
 *
 * A quote is live when status = 'submitted' AND expires_at > NOW().
 *
 *   closed           the request was cancelled (by the customer, a provider or
 *                    the back office, including the 72-hour expiry)
 *   payment_pending  the customer accepted a quote and has not paid yet
 *   booked           any later booking status (paid, en route, done, disputed)
 *   quote_ready      at least one live quote is waiting for the customer
 *   no_pros          no live quote, and round 1 found no provider to notify
 *                    (request_ops_review_reason = 'no_eligible_providers')
 *   reopened         no live quote, and the request is in round 2 or later
 *   waiting          no live quote yet in round 1
 *
 * Leaf module with no imports. The alias is a fixed internal identifier.
 */

export const REQUEST_STAGES = [
  'waiting', 'no_pros', 'quote_ready', 'reopened', 'payment_pending', 'booked', 'closed',
] as const;

export type RequestStageName = typeof REQUEST_STAGES[number];

const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/;

function checkedAlias(alias: string): string {
  if (!SQL_ALIAS.test(alias)) throw new Error('Request stage alias must be a plain SQL identifier.');
  return alias;
}

/** Integer SQL expression: live quotes on the request row. */
export function liveQuoteCountSql(bookingAlias = 'b'): string {
  const b = checkedAlias(bookingAlias);
  return `(SELECT COUNT(*)::int FROM booking_quotes live_q
            WHERE live_q.booking_id = ${b}.id
              AND live_q.status = 'submitted'
              AND live_q.expires_at > NOW())`;
}

/** Text SQL expression: the stage of the request row (one of REQUEST_STAGES). */
export function requestStageSql(bookingAlias = 'b'): string {
  const b = checkedAlias(bookingAlias);
  return `(CASE
      WHEN ${b}.status IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin') THEN 'closed'
      WHEN ${b}.status = 'payment_pending' THEN 'payment_pending'
      WHEN ${b}.status NOT IN ('requested', 'quoted') THEN 'booked'
      WHEN ${liveQuoteCountSql(b)} > 0 THEN 'quote_ready'
      WHEN ${b}.request_ops_review_reason = 'no_eligible_providers' THEN 'no_pros'
      WHEN ${b}.request_round > 1 THEN 'reopened'
      ELSE 'waiting'
    END)`;
}

/** The stage fragment for a bookings row aliased `b`. */
export const REQUEST_STAGE_SQL = requestStageSql('b');
