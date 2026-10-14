/**
 * D38 Milestone 3 (Ken, 2026-10-13): read-only marketplace insights for the
 * back office. Ken's notes: "show insights towards anytime there has been a
 * service request where a customer has submitted a request for help and no
 * one responded", so the team can call providers, recruit faster ones or add
 * more. Plan: qa-frameworks/human-audit-2026-10-13/design-admin.md section 4.1
 * with the merged.md P6 renames (invites use sent_at and status 'sent'; the
 * wait starts at COALESCE(request_round_opened_at, created_at), or later when
 * a quote in the round lapsed; budget_unknown; the review flag is
 * request_ops_review_at).
 *
 *   getOpenRequests          the live queue: every open quote request, the
 *                            ones still waiting on providers first, longest
 *                            wait first.
 *   getRequestInvites        Booking 360 "Who was notified".
 *   getResponseTimes         time to first response, p50 and p90, by category
 *                            and/or city, for Manila calendar days.
 *   getLostOpportunities     closed requests that never got booked, each with
 *                            exactly one reason.
 *   getProviderResponsiveness per-provider invites, view rate, response rate
 *                            and median response time.
 *   getCoverageGrid          service area x category: approved and recently
 *                            responsive providers.
 *   getMarketplaceSummary    the dashboard figures.
 *
 * Every function only reads. Nothing here contacts a provider, changes a
 * request, quote or invite, or feeds matching, ranking or quality scores
 * (E33, E47). The responsiveness numbers are for back-office follow-up only.
 *
 * Definitions shared with marketplace-alert.service.ts:
 *   - A quote is live when status = 'submitted' AND expires_at > NOW(); it
 *     holds the request while live, and for good once accepted.
 *   - A request with no live quote has waited since its round opened, or
 *     since its last quote in that round stopped being live, whichever is
 *     later (WAIT_ANCHOR_SQL).
 *   - A provider responded when their invite is linked to the quote they
 *     sent (quote_id and responded_at set) and the invite is 'quoted', or was
 *     'declined' by the customer or 'passed' by a withdrawal afterwards.
 *     responded_at alone never counts, so an invite closed as expired or taken
 *     is not a response even if a timestamp was written.
 *   - Every age uses the database clock (NOW()), so the page, the summary and
 *     the alert sweep always agree.
 *
 * Contact details: provider phone numbers are returned masked for every role
 * except super_admin (D25, utils/pii-mask.ts); calling a provider goes
 * through the existing audit-logged POST /admin/providers/:id/reveal-contact.
 * Customers appear only as "Ana R." and by barangay and city, never by street
 * address, phone or email.
 */
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { platformConfig } from '../config/platform.config';
import { maskPhilippinePhone } from '../utils/pii-mask';
import * as settingsService from './settings.service';
import type { MarketplaceAlertPolicy } from './settings.service';
import { shortCustomerName } from './job-leads.service';

export const LOST_REASONS = [
  'no_eligible_provider',
  'notified_none_viewed',
  'viewed_none_responded',
  'customer_declined_all_rounds',
  'customer_cancelled_waiting',
  'expired_no_response',
] as const;
export type LostReason = typeof LOST_REASONS[number];

export const RESPONSE_TIME_GROUPS = ['category', 'city', 'category_city'] as const;
export type ResponseTimeGroup = typeof RESPONSE_TIME_GROUPS[number];

export const PROVIDER_SORTS = ['invites', 'slowest', 'lowest_response_rate'] as const;
export type ProviderSort = typeof PROVIDER_SORTS[number];

// ────────────────────────────────────────────────────────────────────
// Shared SQL (fixed aliases: b = bookings, i = job_request_invites)
// ────────────────────────────────────────────────────────────────────

/** When the current round opened: its round clock, or the request's creation. */
export const ROUND_ANCHOR_SQL = 'COALESCE(b.request_round_opened_at, b.created_at)';

/**
 * When the current wait for a quote began, for a request with no live quote:
 * the round's opening or, when a quote sent in this round has since stopped
 * being live, the moment the last one did. That moment is the engine's own
 * lost_at rule (booking.service reconcileRequestAfterQuoteLapse): a lapse
 * counts at the quote's expires_at, a decline or withdrawal at its last
 * update. A lapsed request stays in 'quoted' in the same round until the
 * engine's 5-minute job reopens it, so without this its wait would be counted
 * from a round opening up to 48 hours earlier although a provider answered.
 * Quotes of earlier rounds never move the anchor (a reopen restarts the round
 * clock after them).
 */
export const WAIT_ANCHOR_SQL = `GREATEST(${ROUND_ANCHOR_SQL}, (
    SELECT MAX(CASE WHEN COALESCE(wq.status, 'submitted') IN ('submitted', 'expired') THEN wq.expires_at
                    ELSE wq.updated_at END)
      FROM booking_quotes wq
     WHERE wq.booking_id = b.id AND wq.round = b.request_round
       AND NOT (COALESCE(wq.status, 'submitted') = 'submitted' AND wq.expires_at > NOW())))`;

/** Boolean: request b has an accepted quote. */
export const ACCEPTED_QUOTE_EXISTS_SQL = `EXISTS (SELECT 1 FROM booking_quotes aq
    WHERE aq.booking_id = b.id AND (aq.is_accepted = TRUE OR aq.status = 'accepted'))`;

/** Boolean: request b has a live quote (submitted and not expired). */
export const LIVE_QUOTE_EXISTS_SQL = `EXISTS (SELECT 1 FROM booking_quotes lq
    WHERE lq.booking_id = b.id AND COALESCE(lq.status, 'submitted') = 'submitted' AND lq.expires_at > NOW())`;

/** Request b is an open quote request: still requested or quoted, nobody booked. */
export const OPEN_REQUEST_WHERE_SQL = `b.booking_type = 'quote_based'
    AND b.status IN ('requested', 'quoted')
    AND b.provider_id IS NULL
    AND NOT ${ACCEPTED_QUOTE_EXISTS_SQL}`;

/** Boolean: invite i is a real response (see the header). */
export const REAL_RESPONSE_SQL = `(i.quote_id IS NOT NULL AND i.responded_at IS NOT NULL
    AND i.status IN ('quoted', 'declined', 'passed'))`;

/** The cancelled statuses a quote request can close with. */
const CLOSED_STATUSES_SQL = `('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')`;

/** Provider display name for providers p joined to users u. */
const PROVIDER_NAME_SQL = `COALESCE(NULLIF(TRIM(p.business_name), ''),
    NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Provider')`;

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value).toISOString();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundTo(value: number | null, places: number): number | null {
  if (value === null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? roundTo(part / whole, 3) : null;
}

/** Provider phone for an admin role: raw for super_admin only (D25). */
function contactFor(phone: string | null, actorRole: string): { phone: string | null; contactMasked: boolean } {
  if (actorRole === 'super_admin') return { phone: phone ?? null, contactMasked: false };
  return { phone: phone ? maskPhilippinePhone(phone) : null, contactMasked: true };
}

// ────────────────────────────────────────────────────────────────────
// Manila date ranges
// ────────────────────────────────────────────────────────────────────

export interface ManilaRange {
  /** First Manila calendar day, inclusive (YYYY-MM-DD). */
  from: string;
  /** Last Manila calendar day, inclusive (YYYY-MM-DD). */
  to: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Resolve a from/to pair of Manila calendar days (both inclusive). Defaults:
 * the last 30 days ending today in the platform time zone. 400 when a date is
 * not a real calendar day, `to` is before `from`, or the range spans more
 * than 366 days.
 */
export function resolveManilaRange(query: { from?: string; to?: string }): ManilaRange {
  // Check what was sent before deriving the other end: addDays on an
  // impossible day (2026-13-01) would throw a RangeError and answer 500.
  for (const sent of [query.from, query.to]) {
    if (sent !== undefined && !isCalendarDate(sent)) {
      throw createAppError('Dates must be real calendar days written as YYYY-MM-DD.', 400);
    }
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: platformConfig.timezone });
  const to = query.to ?? (query.from ? addDays(query.from, DEFAULT_RANGE_DAYS - 1) : today);
  const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    throw createAppError('Dates must be real calendar days written as YYYY-MM-DD.', 400);
  }
  if (to < from) throw createAppError('The end date must not be before the start date.', 400);
  if (dayCount(from, to) > MAX_RANGE_DAYS) {
    throw createAppError(`A date range can cover at most ${MAX_RANGE_DAYS} days.`, 400);
  }
  return { from, to };
}

/**
 * SQL condition: `column` falls on the Manila days of the range. $from, $to
 * and $zone are the placeholders holding the range and the time zone name.
 */
function inManilaRangeSql(column: string, from: string, to: string, zone: string): string {
  return `${column} >= (${from}::date)::timestamp AT TIME ZONE ${zone}::text
      AND ${column} < ((${to}::date) + 1)::timestamp AT TIME ZONE ${zone}::text`;
}

// ────────────────────────────────────────────────────────────────────
// Open requests (Waiting now)
// ────────────────────────────────────────────────────────────────────

export type WaitSeverity = 'none' | 'amber' | 'red';

export interface OpenRequestRow {
  bookingId: string;
  categoryName: string | null;
  subcategoryName: string | null;
  barangay: string | null;
  city: string | null;
  urgency: string | null;
  scheduledAt: string | null;
  createdAt: string;
  /**
   * When the current wait began. Waiting on providers: the round's opening
   * (else the request's creation), or the moment the round's last quote
   * lapsed, if later. Waiting on the customer: the round's opening.
   */
  waitingSince: string;
  waitMinutes: number;
  /** 'providers': no live quote yet. 'customer': a live quote waits for the customer. */
  waitingOn: 'providers' | 'customer';
  severity: WaitSeverity;
  round: number;
  maxRounds: number;
  /** Current round: providers pushed, providers who opened it, providers who sent a quote. */
  notified: number;
  viewed: number;
  responded: number;
  /** The same counts over every round. */
  notifiedTotal: number;
  viewedTotal: number;
  respondedTotal: number;
  liveQuotes: number;
  totalQuotes: number;
  /** Quotes the customer declined (not "not selected" siblings). */
  declinedQuotes: number;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  budgetUnknown: boolean;
  opsReviewAt: string | null;
  opsReviewReason: string | null;
  openAlertIds: string[];
  customer: { id: string; displayName: string };
}

interface OpenRequestDbRow {
  id: string;
  customer_id: string;
  category_name: string | null;
  subcategory_name: string | null;
  barangay: string | null;
  city: string | null;
  urgency: string | null;
  scheduled_at: Date | null;
  created_at: Date;
  waiting_since: Date;
  wait_minutes: number;
  request_round: number;
  notified: number;
  viewed: number;
  responded: number;
  notified_total: number;
  viewed_total: number;
  responded_total: number;
  live_quotes: number;
  total_quotes: number;
  declined_quotes: number;
  budget_min: number | null;
  budget_max: number | null;
  budget_unknown: boolean;
  request_ops_review_at: Date | null;
  request_ops_review_reason: string | null;
  open_alert_ids: string[] | null;
  first_name: string | null;
  last_name: string | null;
}

export function waitSeverity(waitMinutes: number, policy: Pick<MarketplaceAlertPolicy, 'amberMinutes' | 'redMinutes'>): WaitSeverity {
  if (waitMinutes >= policy.redMinutes) return 'red';
  if (waitMinutes >= policy.amberMinutes) return 'amber';
  return 'none';
}

/**
 * Every open quote request. Requests still waiting on providers come first,
 * longest wait first; then the ones whose live quote waits for the customer.
 */
export async function getOpenRequests(opts: { limit: number }): Promise<{
  requests: OpenRequestRow[];
  policy: MarketplaceAlertPolicy;
}> {
  const policy = await settingsService.getMarketplaceAlertPolicy();
  const result = await db.query<OpenRequestDbRow>(
    `SELECT b.id, b.customer_id, sc.name AS category_name, sub.name AS subcategory_name,
            b.barangay, b.city, b.urgency, b.scheduled_at, b.created_at,
            ws.waiting_since,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ws.waiting_since)) / 60))::int AS wait_minutes,
            b.request_round,
            inv.notified, inv.viewed, inv.responded, inv.notified_total, inv.viewed_total, inv.responded_total,
            qs.live_quotes, qs.total_quotes, qs.declined_quotes,
            b.budget_min, b.budget_max, b.budget_unknown,
            b.request_ops_review_at, b.request_ops_review_reason,
            al.open_alert_ids,
            u.first_name, u.last_name
       FROM bookings b
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
       LEFT JOIN users u ON u.id = b.customer_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE i.round = b.request_round AND i.source = 'push')::int AS notified,
                COUNT(*) FILTER (WHERE i.round = b.request_round AND i.viewed_at IS NOT NULL)::int AS viewed,
                COUNT(*) FILTER (WHERE i.round = b.request_round AND ${REAL_RESPONSE_SQL})::int AS responded,
                COUNT(*) FILTER (WHERE i.source = 'push')::int AS notified_total,
                COUNT(*) FILTER (WHERE i.viewed_at IS NOT NULL)::int AS viewed_total,
                COUNT(*) FILTER (WHERE ${REAL_RESPONSE_SQL})::int AS responded_total
           FROM job_request_invites i
          WHERE i.booking_id = b.id
       ) inv ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE COALESCE(q.status, 'submitted') = 'submitted' AND q.expires_at > NOW())::int AS live_quotes,
                COUNT(*)::int AS total_quotes,
                COUNT(*) FILTER (WHERE q.declined_at IS NOT NULL)::int AS declined_quotes
           FROM booking_quotes q
          WHERE q.booking_id = b.id
       ) qs ON TRUE
       -- Waiting on providers: since the round opened or its last quote
       -- lapsed. Waiting on the customer: since the round opened.
       CROSS JOIN LATERAL (
         SELECT CASE WHEN qs.live_quotes > 0 THEN ${ROUND_ANCHOR_SQL} ELSE ${WAIT_ANCHOR_SQL} END AS waiting_since
       ) ws
       LEFT JOIN LATERAL (
         SELECT COALESCE(array_agg(a.id ORDER BY a.raised_at, a.id), '{}'::uuid[]) AS open_alert_ids
           FROM marketplace_alerts a
          WHERE a.booking_id = b.id AND a.resolved_at IS NULL
       ) al ON TRUE
      WHERE ${OPEN_REQUEST_WHERE_SQL}
      ORDER BY (qs.live_quotes = 0) DESC, ws.waiting_since ASC, b.id
      LIMIT $1`,
    [opts.limit],
  );

  const requests = result.rows.map((row): OpenRequestRow => {
    const waitMinutes = Number(row.wait_minutes);
    const waitingOn = Number(row.live_quotes) > 0 ? 'customer' : 'providers';
    return {
      bookingId: row.id,
      categoryName: row.category_name,
      subcategoryName: row.subcategory_name,
      barangay: row.barangay,
      city: row.city,
      urgency: row.urgency,
      scheduledAt: toIso(row.scheduled_at),
      createdAt: toIso(row.created_at)!,
      waitingSince: toIso(row.waiting_since)!,
      waitMinutes,
      waitingOn,
      severity: waitingOn === 'providers' ? waitSeverity(waitMinutes, policy) : 'none',
      round: Number(row.request_round ?? 1),
      maxRounds: policy.maxRounds,
      notified: Number(row.notified),
      viewed: Number(row.viewed),
      responded: Number(row.responded),
      notifiedTotal: Number(row.notified_total),
      viewedTotal: Number(row.viewed_total),
      respondedTotal: Number(row.responded_total),
      liveQuotes: Number(row.live_quotes),
      totalQuotes: Number(row.total_quotes),
      declinedQuotes: Number(row.declined_quotes),
      budgetMinCentavos: toNumberOrNull(row.budget_min),
      budgetMaxCentavos: toNumberOrNull(row.budget_max),
      budgetUnknown: row.budget_unknown === true,
      opsReviewAt: toIso(row.request_ops_review_at),
      opsReviewReason: row.request_ops_review_reason,
      openAlertIds: row.open_alert_ids ?? [],
      customer: { id: row.customer_id, displayName: shortCustomerName(row.first_name, row.last_name) },
    };
  });
  return { requests, policy };
}

// ────────────────────────────────────────────────────────────────────
// Who was notified (Booking 360)
// ────────────────────────────────────────────────────────────────────

export interface RequestInviteRow {
  inviteId: string;
  providerId: string;
  providerName: string;
  /** Masked for every role except super_admin. */
  phone: string | null;
  contactMasked: boolean;
  round: number;
  /** 'push': the provider was notified. 'inbox': they found the request in their list. */
  source: string;
  status: string;
  sentAt: string;
  viewedAt: string | null;
  respondedAt: string | null;
  /** Minutes from sentAt to the quote; only for a real response. */
  responseMinutes: number | null;
  quoteId: string | null;
  quoteStatus: string | null;
}

export async function getRequestInvites(bookingId: string, actorRole: string): Promise<{
  applicable: boolean;
  currentRound: number;
  invites: RequestInviteRow[];
}> {
  const booking = await db.query<{ booking_type: string; request_round: number }>(
    'SELECT booking_type, request_round FROM bookings WHERE id = $1',
    [bookingId],
  );
  const row = booking.rows[0];
  if (!row) throw createAppError('Booking not found.', 404);
  const currentRound = Number(row.request_round ?? 1);
  if (row.booking_type !== 'quote_based') return { applicable: false, currentRound, invites: [] };

  const result = await db.query<{
    id: string; provider_id: string; provider_name: string; phone: string | null; round: number;
    source: string; status: string; sent_at: Date; viewed_at: Date | null; responded_at: Date | null;
    response_minutes: number | null; quote_id: string | null; quote_status: string | null;
  }>(
    `SELECT i.id, i.provider_id, ${PROVIDER_NAME_SQL} AS provider_name, u.phone,
            i.round, i.source, i.status, i.sent_at, i.viewed_at, i.responded_at,
            CASE WHEN ${REAL_RESPONSE_SQL}
                 THEN (EXTRACT(EPOCH FROM (i.responded_at - i.sent_at)) / 60.0)::float8 END AS response_minutes,
            i.quote_id, q.status AS quote_status
       FROM job_request_invites i
       JOIN providers p ON p.id = i.provider_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN booking_quotes q ON q.id = i.quote_id
      WHERE i.booking_id = $1
      ORDER BY i.round DESC, i.rank NULLS LAST, i.sent_at, i.provider_id`,
    [bookingId],
  );
  return {
    applicable: true,
    currentRound,
    invites: result.rows.map((invite) => ({
      inviteId: invite.id,
      providerId: invite.provider_id,
      providerName: invite.provider_name,
      ...contactFor(invite.phone, actorRole),
      round: Number(invite.round),
      source: invite.source,
      status: invite.status,
      sentAt: toIso(invite.sent_at)!,
      viewedAt: toIso(invite.viewed_at),
      respondedAt: toIso(invite.responded_at),
      responseMinutes: roundTo(toNumberOrNull(invite.response_minutes), 1),
      quoteId: invite.quote_id,
      quoteStatus: invite.quote_status,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────
// Time to first response
// ────────────────────────────────────────────────────────────────────

export interface ResponseTimeGroupRow {
  categoryName?: string | null;
  city?: string | null;
  requests: number;
  /** Requests that got at least one quote. */
  responded: number;
  /** Requests with no quote (yet). Left out of p50 and p90. */
  noResponse: number;
  p50Minutes: number | null;
  p90Minutes: number | null;
  /**
   * Percentage (0-100, one decimal) of the requests whose first quote came
   * within 30 minutes (design-admin.md 4.1). Requests with no quote count as
   * not answered within 30 minutes. Null for an empty group.
   */
  within30Pct: number | null;
}

/** The within30Pct cut-off, in minutes (design-admin.md 4.1). */
const WITHIN_MINUTES = 30;

const RESPONSE_TIME_GROUP_COLUMNS: Readonly<Record<ResponseTimeGroup, readonly string[]>> = {
  category: ['category_name'],
  city: ['city'],
  category_city: ['category_name', 'city'],
};

interface ResponseTimeAggregateRow {
  requests: number;
  responded: number;
  no_response: number;
  p50: number | null;
  p90: number | null;
  within_pct: number | null;
}

const RESPONSE_TIME_AGGREGATES = `COUNT(*)::int AS requests,
       COUNT(ttfr_minutes)::int AS responded,
       (COUNT(*) - COUNT(ttfr_minutes))::int AS no_response,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY ttfr_minutes))::float8 AS p50,
       (percentile_cont(0.9) WITHIN GROUP (ORDER BY ttfr_minutes))::float8 AS p90,
       (100.0 * COUNT(*) FILTER (WHERE ttfr_minutes <= ${WITHIN_MINUTES}) / NULLIF(COUNT(*), 0))::float8 AS within_pct`;

/**
 * Time to first response: the first quote's created_at minus the request's
 * created_at, in minutes, for quote requests created on the range's Manila
 * calendar days. A reopened round only ever follows a quote, so the first
 * quote always answers the original request. Requests with no quote count in
 * noResponse and are left out of the percentiles; within30Pct counts them as
 * not answered within 30 minutes.
 */
export async function getResponseTimes(range: ManilaRange, groupBy: ResponseTimeGroup): Promise<{
  overall: ResponseTimeGroupRow;
  groups: ResponseTimeGroupRow[];
}> {
  const columns = RESPONSE_TIME_GROUP_COLUMNS[groupBy];
  const requestsCte = `WITH req AS (
      SELECT sc.name AS category_name,
             NULLIF(INITCAP(TRIM(b.city)), '') AS city,
             (EXTRACT(EPOCH FROM (fq.first_quote_at - b.created_at)) / 60.0)::float8 AS ttfr_minutes
        FROM bookings b
        LEFT JOIN service_categories sc ON sc.id = b.category_id
        LEFT JOIN LATERAL (
          SELECT MIN(q.created_at) AS first_quote_at FROM booking_quotes q WHERE q.booking_id = b.id
        ) fq ON TRUE
       WHERE b.booking_type = 'quote_based'
         AND ${inManilaRangeSql('b.created_at', '$1', '$2', '$3')}
    )`;
  const params = [range.from, range.to, platformConfig.timezone];
  const [overallResult, groupResult] = await Promise.all([
    db.query<ResponseTimeAggregateRow>(
      `${requestsCte} SELECT ${RESPONSE_TIME_AGGREGATES} FROM req`,
      params,
    ),
    db.query<Record<string, unknown> & ResponseTimeAggregateRow>(
      `${requestsCte}
       SELECT ${columns.join(', ')}, ${RESPONSE_TIME_AGGREGATES}
         FROM req
        GROUP BY ${columns.join(', ')}
        ORDER BY COUNT(*) DESC, ${columns.map((column) => `${column} NULLS LAST`).join(', ')}`,
      params,
    ),
  ]);

  const toGroup = (row: ResponseTimeAggregateRow): Omit<ResponseTimeGroupRow, 'categoryName' | 'city'> => ({
    requests: Number(row.requests),
    responded: Number(row.responded),
    noResponse: Number(row.no_response),
    p50Minutes: roundTo(toNumberOrNull(row.p50), 1),
    p90Minutes: roundTo(toNumberOrNull(row.p90), 1),
    within30Pct: roundTo(toNumberOrNull(row.within_pct), 1),
  });
  return {
    overall: toGroup(overallResult.rows[0]!),
    groups: groupResult.rows.map((row) => ({
      ...(columns.includes('category_name') ? { categoryName: (row.category_name as string | null) ?? null } : {}),
      ...(columns.includes('city') ? { city: (row.city as string | null) ?? null } : {}),
      ...toGroup(row),
    })),
  };
}

// ────────────────────────────────────────────────────────────────────
// Lost opportunities
// ────────────────────────────────────────────────────────────────────

export interface LostOpportunityRow {
  bookingId: string;
  reason: LostReason;
  closedBy: 'customer' | 'provider' | 'admin' | 'system';
  status: string;
  cancellationReason: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  barangay: string | null;
  city: string | null;
  createdAt: string;
  closedAt: string;
  rounds: number;
  invited: number;
  viewed: number;
  quotes: number;
  declinedQuotes: number;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  budgetUnknown: boolean;
  /** Budget midpoint, else whichever end was given; null with no budget. */
  estimatedValueCentavos: number | null;
}

export interface LostOpportunitySummary {
  total: number;
  byReason: Record<LostReason, number>;
  /** Sum of estimatedValueCentavos over the rows that have one. */
  estimatedValueCentavos: number;
  /** Rows with no budget (customer chose "Not sure" or gave none). */
  withoutBudget: number;
}

/**
 * Closed quote requests created on the range's Manila days that never got a
 * booking (cancelled, with no accepted quote). Each gets exactly one reason,
 * the first that matches:
 *   customer_declined_all_rounds  the customer declined at least one quote
 *   customer_cancelled_waiting    the customer cancelled while waiting
 *   no_eligible_provider          round 1 found nobody to notify
 *                                 (request_ops_review_reason
 *                                 'no_eligible_providers'), or nobody was ever
 *                                 told about it, by invite or by the older
 *                                 new_job_request notices
 *   notified_none_viewed          providers were told, none opened it, no quote
 *   viewed_none_responded         providers opened it, nobody quoted
 *   expired_no_response           everything else: quotes that lapsed or were
 *                                 withdrawn, and older requests whose views
 *                                 were never recorded
 */
function lostRequestsCte(): string {
  return `WITH legacy AS (
      SELECT n.data->>'bookingId' AS booking_id, COUNT(*)::int AS notified
        FROM notifications n
       WHERE n.type IN ('new_job_request', 'job_request_reopened')
         AND n.created_at >= ($1::date)::timestamp AT TIME ZONE $3::text
       GROUP BY 1
    ),
    lost AS (
      SELECT b.id, b.status, b.cancellation_reason, b.created_at,
             COALESCE(b.cancelled_at, b.updated_at) AS closed_at,
             b.request_round, b.request_ops_review_reason,
             b.budget_min, b.budget_max, b.budget_unknown, b.barangay, b.city,
             sc.name AS category_name, sub.name AS subcategory_name,
             inv.invites_total, inv.viewed_total,
             qs.quotes_total, qs.declined_quotes,
             COALESCE(lg.notified, 0) AS legacy_notified,
             EXISTS (SELECT 1 FROM admin_actions aa
                      WHERE aa.target_type = 'booking' AND aa.target_id = b.id
                        AND aa.action_type = 'booking_cancelled') AS admin_cancelled
        FROM bookings b
        LEFT JOIN service_categories sc ON sc.id = b.category_id
        LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
        LEFT JOIN legacy lg ON lg.booking_id = b.id::text
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS invites_total, COUNT(i.viewed_at)::int AS viewed_total
            FROM job_request_invites i WHERE i.booking_id = b.id
        ) inv ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS quotes_total,
                 COUNT(*) FILTER (WHERE q.declined_at IS NOT NULL)::int AS declined_quotes
            FROM booking_quotes q WHERE q.booking_id = b.id
        ) qs ON TRUE
       WHERE b.booking_type = 'quote_based'
         AND b.status IN ${CLOSED_STATUSES_SQL}
         AND NOT ${ACCEPTED_QUOTE_EXISTS_SQL}
         AND ${inManilaRangeSql('b.created_at', '$1', '$2', '$3')}
    ),
    classified AS (
      SELECT lost.*,
             CASE
               WHEN declined_quotes > 0 THEN 'customer_declined_all_rounds'
               WHEN status = 'cancelled_by_customer' THEN 'customer_cancelled_waiting'
               WHEN request_ops_review_reason = 'no_eligible_providers'
                 OR (invites_total = 0 AND legacy_notified = 0) THEN 'no_eligible_provider'
               WHEN invites_total > 0 AND viewed_total = 0 AND quotes_total = 0 THEN 'notified_none_viewed'
               WHEN viewed_total > 0 AND quotes_total = 0 THEN 'viewed_none_responded'
               ELSE 'expired_no_response'
             END AS reason,
             CASE
               WHEN status = 'cancelled_by_customer' THEN 'customer'
               WHEN status = 'cancelled_by_provider' THEN 'provider'
               WHEN admin_cancelled THEN 'admin'
               ELSE 'system'
             END AS closed_by,
             CASE
               WHEN budget_unknown THEN NULL
               WHEN budget_min IS NOT NULL AND budget_max IS NOT NULL THEN (budget_min + budget_max) / 2
               ELSE COALESCE(budget_max, budget_min)
             END AS estimated_value
        FROM lost
    )`;
}

export async function getLostOpportunities(
  range: ManilaRange,
  opts: { reason?: LostReason; page: number; pageSize: number },
): Promise<{ rows: LostOpportunityRow[]; total: number; summary: LostOpportunitySummary }> {
  const params = [range.from, range.to, platformConfig.timezone];
  const [pageResult, summaryResult] = await Promise.all([
    db.query<{
      id: string; status: string; cancellation_reason: string | null; created_at: Date; closed_at: Date;
      request_round: number; budget_min: number | null; budget_max: number | null; budget_unknown: boolean;
      barangay: string | null; city: string | null; category_name: string | null; subcategory_name: string | null;
      invites_total: number; viewed_total: number; quotes_total: number; declined_quotes: number;
      reason: LostReason; closed_by: LostOpportunityRow['closedBy']; estimated_value: number | null;
    }>(
      `${lostRequestsCte()}
       SELECT classified.*
         FROM classified
        WHERE ($4::text IS NULL OR reason = $4::text)
        ORDER BY closed_at DESC, id
        LIMIT $5 OFFSET $6`,
      [...params, opts.reason ?? null, opts.pageSize, (opts.page - 1) * opts.pageSize],
    ),
    db.query<{ reason: LostReason; n: number; value: number | null; without_budget: number }>(
      `${lostRequestsCte()}
       SELECT reason, COUNT(*)::int AS n, SUM(estimated_value)::bigint AS value,
              COUNT(*) FILTER (WHERE estimated_value IS NULL)::int AS without_budget
         FROM classified
        GROUP BY reason`,
      params,
    ),
  ]);

  const byReason = Object.fromEntries(LOST_REASONS.map((reason) => [reason, 0])) as Record<LostReason, number>;
  let estimatedValueCentavos = 0;
  let withoutBudget = 0;
  let summaryTotal = 0;
  for (const row of summaryResult.rows) {
    byReason[row.reason] = Number(row.n);
    summaryTotal += Number(row.n);
    estimatedValueCentavos += Number(row.value ?? 0);
    withoutBudget += Number(row.without_budget);
  }

  return {
    rows: pageResult.rows.map((row) => ({
      bookingId: row.id,
      reason: row.reason,
      closedBy: row.closed_by,
      status: row.status,
      cancellationReason: row.cancellation_reason,
      categoryName: row.category_name,
      subcategoryName: row.subcategory_name,
      barangay: row.barangay,
      city: row.city,
      createdAt: toIso(row.created_at)!,
      closedAt: toIso(row.closed_at)!,
      rounds: Number(row.request_round ?? 1),
      invited: Number(row.invites_total),
      viewed: Number(row.viewed_total),
      quotes: Number(row.quotes_total),
      declinedQuotes: Number(row.declined_quotes),
      budgetMinCentavos: toNumberOrNull(row.budget_min),
      budgetMaxCentavos: toNumberOrNull(row.budget_max),
      budgetUnknown: row.budget_unknown === true,
      estimatedValueCentavos: toNumberOrNull(row.estimated_value),
    })),
    // The summary counts the same rows, so the (filtered) total comes from it.
    total: opts.reason ? byReason[opts.reason] : summaryTotal,
    summary: { total: summaryTotal, byReason, estimatedValueCentavos, withoutBudget },
  };
}

// ────────────────────────────────────────────────────────────────────
// Provider responsiveness
// ────────────────────────────────────────────────────────────────────

export interface ProviderResponsivenessRow {
  providerId: string;
  providerName: string;
  providerStatus: string;
  isAvailable: boolean;
  /** Masked for every role except super_admin. */
  phone: string | null;
  contactMasked: boolean;
  /** Invite records in the range: pushed to the provider, or opened from their list. */
  invites: number;
  /** Of those, the ones pushed to the provider. */
  notified: number;
  viewed: number;
  responded: number;
  viewedRate: number | null;
  responseRate: number | null;
  /** Median minutes from the invite to the quote, real responses only. */
  medianResponseMinutes: number | null;
  quotesAccepted: number;
  lastActiveAt: string | null;
}

const PROVIDER_SORT_SQL: Readonly<Record<ProviderSort, string>> = {
  invites: 's.invites DESC, s.provider_id',
  slowest: 's.median_minutes DESC NULLS LAST, s.invites DESC, s.provider_id',
  lowest_response_rate: '(s.responded::float8 / NULLIF(s.invites, 0)) ASC NULLS LAST, s.invites DESC, s.provider_id',
};

/**
 * Per provider, over the invites sent on the range's Manila days. For
 * back-office follow-up only (calling slow providers, recruiting): these
 * numbers are never written to the provider or read by matching, ranking or
 * quality scores (E47).
 */
export async function getProviderResponsiveness(
  range: ManilaRange,
  opts: { sort: ProviderSort; page: number; pageSize: number; actorRole: string },
): Promise<{ rows: ProviderResponsivenessRow[]; total: number }> {
  const statsCte = `WITH stats AS (
       SELECT i.provider_id,
              COUNT(*)::int AS invites,
              COUNT(*) FILTER (WHERE i.source = 'push')::int AS notified,
              COUNT(i.viewed_at)::int AS viewed,
              COUNT(*) FILTER (WHERE ${REAL_RESPONSE_SQL})::int AS responded,
              (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.responded_at - i.sent_at)) / 60.0)
                 FILTER (WHERE ${REAL_RESPONSE_SQL}))::float8 AS median_minutes,
              COUNT(*) FILTER (WHERE ${REAL_RESPONSE_SQL} AND (q.is_accepted = TRUE OR q.status = 'accepted'))::int
                AS quotes_accepted,
              MAX(i.viewed_at) AS last_viewed_at,
              MAX(q.created_at) FILTER (WHERE ${REAL_RESPONSE_SQL}) AS last_quote_at
         FROM job_request_invites i
         LEFT JOIN booking_quotes q ON q.id = i.quote_id
        WHERE ${inManilaRangeSql('i.sent_at', '$1', '$2', '$3')}
        GROUP BY i.provider_id
     )`;
  const rangeParams = [range.from, range.to, platformConfig.timezone];
  // The total is counted on its own so that a page past the last one still
  // reports how many providers there are.
  const [result, totalResult] = await Promise.all([
    db.query<{
      provider_id: string; provider_name: string; provider_status: string; is_available: boolean;
      phone: string | null; invites: number; notified: number; viewed: number; responded: number;
      median_minutes: number | null; quotes_accepted: number; last_active_at: Date | null;
    }>(
      `${statsCte}
       SELECT s.provider_id, ${PROVIDER_NAME_SQL} AS provider_name, p.status AS provider_status,
              p.is_available, u.phone, s.invites, s.notified, s.viewed, s.responded, s.median_minutes,
              s.quotes_accepted, GREATEST(u.last_login_at, s.last_viewed_at, s.last_quote_at) AS last_active_at
         FROM stats s
         JOIN providers p ON p.id = s.provider_id
         JOIN users u ON u.id = p.user_id
        ORDER BY ${PROVIDER_SORT_SQL[opts.sort]}
        LIMIT $4 OFFSET $5`,
      [...rangeParams, opts.pageSize, (opts.page - 1) * opts.pageSize],
    ),
    db.query<{ total: number }>(
      `${statsCte}
       SELECT COUNT(*)::int AS total
         FROM stats s
         JOIN providers p ON p.id = s.provider_id
         JOIN users u ON u.id = p.user_id`,
      rangeParams,
    ),
  ]);
  return {
    rows: result.rows.map((row) => {
      const invites = Number(row.invites);
      const viewed = Number(row.viewed);
      const responded = Number(row.responded);
      return {
        providerId: row.provider_id,
        providerName: row.provider_name,
        providerStatus: row.provider_status,
        isAvailable: row.is_available === true,
        ...contactFor(row.phone, opts.actorRole),
        invites,
        notified: Number(row.notified),
        viewed,
        responded,
        viewedRate: rate(viewed, invites),
        responseRate: rate(responded, invites),
        medianResponseMinutes: roundTo(toNumberOrNull(row.median_minutes), 1),
        quotesAccepted: Number(row.quotes_accepted),
        lastActiveAt: toIso(row.last_active_at),
      };
    }),
    total: Number(totalResult.rows[0]?.total ?? 0),
  };
}

// ────────────────────────────────────────────────────────────────────
// Coverage grid
// ────────────────────────────────────────────────────────────────────

export interface CoverageCell {
  areaId: string;
  categoryId: string;
  /** Approved providers assigned to the area who offer the category. */
  approvedProviders: number;
  /** Of those, the ones who sent a quote on a request in this category in the last 7 days. */
  responsiveProviders: number;
  /** Quote requests in this category in the last 30 days whose nearest covering area is this one. */
  requests30d: number;
  /** responsiveProviders is under the ops_coverage_min_responsive_providers setting. */
  belowThreshold: boolean;
}

const AREA_DISTANCE_SQL = `(6371 * acos(LEAST(1.0, GREATEST(-1.0,
    cos(radians(rq.latitude::float8)) * cos(radians(a.center_lat::float8))
      * cos(radians(a.center_lng::float8) - radians(rq.longitude::float8))
    + sin(radians(rq.latitude::float8)) * sin(radians(a.center_lat::float8))))))`;

/**
 * Active, soft-launch and recruiting service areas crossed with active
 * categories. A provider counts for an area through the admin-managed
 * provider_service_areas assignment, and for a category through an active
 * service in it, directly or through one of its subcategories (the request
 * eligibility rule). Responsive means a quote in that category in the last 7
 * days. Display only.
 */
export async function getCoverageGrid(): Promise<{
  threshold: number;
  areas: Array<{ id: string; name: string; status: string }>;
  categories: Array<{ id: string; name: string }>;
  cells: CoverageCell[];
}> {
  const policy = await settingsService.getMarketplaceAlertPolicy();
  const threshold = policy.coverageMinResponsive;
  const areaFilter = `status IN ('active', 'soft_launch', 'recruiting')`;
  const [areas, categories, cells] = await Promise.all([
    db.query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM service_areas WHERE ${areaFilter} ORDER BY name, id`,
    ),
    db.query<{ id: string; name: string }>(
      'SELECT id, name FROM service_categories WHERE is_active = TRUE ORDER BY name, id',
    ),
    db.query<{ area_id: string; category_id: string; approved: number; responsive: number; requests_30d: number }>(
      `WITH areas AS (
         SELECT id, name, center_lat, center_lng, radius_km FROM service_areas WHERE ${areaFilter}
       ),
       cats AS (SELECT id, name FROM service_categories WHERE is_active = TRUE),
       area_providers AS (
         SELECT DISTINCT psa.service_area_id AS area_id, pc.category_id, p.id AS provider_id
           FROM provider_service_areas psa
           JOIN providers p ON p.id = psa.provider_id AND p.status = 'approved'
           JOIN provider_services ps ON ps.provider_id = p.id AND ps.is_active = TRUE
           LEFT JOIN service_subcategories ssc ON ssc.id = ps.subcategory_id
           CROSS JOIN LATERAL (VALUES (ps.category_id), (ssc.category_id)) AS pc(category_id)
          WHERE pc.category_id IS NOT NULL
       ),
       responsive AS (
         SELECT DISTINCT q.provider_id, rb.category_id
           FROM booking_quotes q
           JOIN bookings rb ON rb.id = q.booking_id
          WHERE q.created_at >= NOW() - INTERVAL '7 days'
       ),
       recent_requests AS (
         SELECT rq.category_id, nearest.area_id
           FROM bookings rq
           JOIN LATERAL (
             SELECT a.id AS area_id
               FROM areas a
              WHERE ${AREA_DISTANCE_SQL} <= a.radius_km::float8
              ORDER BY ${AREA_DISTANCE_SQL}, a.id
              LIMIT 1
           ) nearest ON TRUE
          WHERE rq.booking_type = 'quote_based'
            AND rq.created_at >= NOW() - INTERVAL '30 days'
            AND rq.latitude IS NOT NULL AND rq.longitude IS NOT NULL
       )
       SELECT a.id AS area_id, c.id AS category_id,
              (SELECT COUNT(*)::int FROM area_providers ap
                WHERE ap.area_id = a.id AND ap.category_id = c.id) AS approved,
              (SELECT COUNT(*)::int FROM area_providers ap
                 JOIN responsive r ON r.provider_id = ap.provider_id AND r.category_id = ap.category_id
                WHERE ap.area_id = a.id AND ap.category_id = c.id) AS responsive,
              (SELECT COUNT(*)::int FROM recent_requests rr
                WHERE rr.area_id = a.id AND rr.category_id = c.id) AS requests_30d
         FROM areas a CROSS JOIN cats c
        ORDER BY a.name, a.id, c.name, c.id`,
    ),
  ]);
  return {
    threshold,
    areas: areas.rows,
    categories: categories.rows,
    cells: cells.rows.map((row) => ({
      areaId: row.area_id,
      categoryId: row.category_id,
      approvedProviders: Number(row.approved),
      responsiveProviders: Number(row.responsive),
      requests30d: Number(row.requests_30d),
      belowThreshold: Number(row.responsive) < threshold,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────
// Dashboard summary
// ────────────────────────────────────────────────────────────────────

export interface MarketplaceSummary {
  /** Open quote requests with no live quote (waiting on providers). */
  waitingCount: number;
  /** Of those, waiting at least amberMinutes since the round opened. */
  waitingOverAmber: number;
  /** Of those, waiting at least redMinutes. */
  waitingOverRed: number;
  /** Open requests whose live quote waits for the customer. */
  awaitingCustomer: number;
  openAlerts: number;
  unacknowledgedAlerts: number;
  amberMinutes: number;
  redMinutes: number;
}

/**
 * The dashboard's "requests waiting more than N minutes" figure, in its own
 * function so admin-analytics getDashboardKpis stays unchanged.
 */
export async function getMarketplaceSummary(): Promise<MarketplaceSummary> {
  const policy = await settingsService.getMarketplaceAlertPolicy();
  const result = await db.query<{
    waiting: number; over_amber: number; over_red: number; awaiting_customer: number;
    open_alerts: number; unacknowledged_alerts: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE NOT open_req.live)::int AS waiting,
       COUNT(*) FILTER (WHERE NOT open_req.live AND open_req.anchor_at <= NOW() - make_interval(mins => $1::int))::int AS over_amber,
       COUNT(*) FILTER (WHERE NOT open_req.live AND open_req.anchor_at <= NOW() - make_interval(mins => $2::int))::int AS over_red,
       COUNT(*) FILTER (WHERE open_req.live)::int AS awaiting_customer,
       (SELECT COUNT(*)::int FROM marketplace_alerts WHERE resolved_at IS NULL) AS open_alerts,
       (SELECT COUNT(*)::int FROM marketplace_alerts WHERE resolved_at IS NULL AND acknowledged_at IS NULL)
         AS unacknowledged_alerts
     FROM (
       SELECT ${WAIT_ANCHOR_SQL} AS anchor_at, ${LIVE_QUOTE_EXISTS_SQL} AS live
         FROM bookings b
        WHERE ${OPEN_REQUEST_WHERE_SQL}
     ) open_req`,
    [policy.amberMinutes, policy.redMinutes],
  );
  const row = result.rows[0]!;
  return {
    waitingCount: Number(row.waiting),
    waitingOverAmber: Number(row.over_amber),
    waitingOverRed: Number(row.over_red),
    awaitingCustomer: Number(row.awaiting_customer),
    openAlerts: Number(row.open_alerts),
    unacknowledgedAlerts: Number(row.unacknowledged_alerts),
    amberMinutes: policy.amberMinutes,
    redMinutes: policy.redMinutes,
  };
}
