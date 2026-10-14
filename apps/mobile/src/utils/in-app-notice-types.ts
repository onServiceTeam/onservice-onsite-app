/**
 * D38 Milestone 2: which stored notices get the in-app banner while the app
 * is open (InAppNoticeHost), and which of those also vibrate. Shared with the
 * foreground push handler (push.service), which skips the phone's own banner
 * for these types while the live connection is up, so one notice never shows
 * two banners.
 */

/** Notice types that get an in-app banner. */
export const BANNER_NOTICE_TYPES: ReadonlySet<string> = new Set([
  'new_job_request', 'job_request_reopened', 'job_request_cancelled',
  'new_quote', 'quote_accepted', 'quote_declined', 'quote_not_selected', 'quote_withdrawn', 'quote_expired',
  'request_reopened', 'request_still_looking', 'request_ops_review',
  'new_message',
  // R-NOT-01: the assigned pro is told the customer paid (job confirmed).
  'customer_paid',
]);

/** The four "act now" types that also vibrate. */
export const HAPTIC_NOTICE_TYPES: ReadonlySet<string> = new Set([
  'new_job_request', 'job_request_reopened', 'new_quote', 'quote_accepted',
]);
