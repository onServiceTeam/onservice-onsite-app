/**
 * D38 Milestone 3 (Ken, 2026-10-13): back-office alerts for quote requests
 * nobody is answering. Ken's notes: "backend admin alerts even when it takes
 * more than 5 - 10 minutes for a service pro to respond". Plan:
 * qa-frameworks/human-audit-2026-10-13/design-admin.md section 4.2 with the
 * merged.md P6 renames, table from migration 186.
 *
 *   sweepMarketplaceAlerts  the one-minute check (jobs/workers.ts
 *       'marketplace-alerts-sweep'). One READ COMMITTED transaction with a
 *       2-second lock_timeout behind pg_try_advisory_xact_lock, so two
 *       workers never sweep at once and a busy booking row delays it at most
 *       2 seconds (the next minute retries). It raises, once per request,
 *       kind and round:
 *         request_waiting_amber  no live quote ops_request_alert_amber_minutes
 *                                after the round opened, or after the round's
 *                                last quote lapsed if later (WAIT_ANCHOR_SQL;
 *                                a lapsed request waits up to 5 minutes for
 *                                the engine's reopen, so a quote sent within
 *                                minutes never pages as a long wait), and not
 *                                yet red;
 *         request_waiting_red    the same wait reaching
 *                                ops_request_alert_red_minutes (a request
 *                                first seen past red gets red only; an open
 *                                amber is resolved 'escalated');
 *         request_needs_ops      the engine flagged the request for review
 *                                (bookings.request_ops_review_at);
 *         request_unfilled       the request closed in the last 24 hours
 *                                with no quote at all, by expiry, or by the
 *                                customer after waiting at least the amber
 *                                time (an admin's own cancellation is not
 *                                alerted).
 *       Waiting alerts resolve themselves when a quote arrives
 *       (quote_received), a quote is accepted (quote_accepted), the request
 *       closes (booking_closed), the request reopens in a new round
 *       (reopened; the new round alerts again) or the wait is older than the
 *       unmatched-request expiry window (aged_out). needs_ops resolves on
 *       acceptance or closure. unfilled resolves only when acknowledged.
 *       Waits that began more than that window ago raise nothing, so the
 *       first run after a deploy does not alert on every old request.
 *       After the commit each new alert is announced once: alert:new to the
 *       admin:global room (the existing ADMIN_EVENTS.ALERT_NEW, so the admin
 *       event list stays at 10) and one Slack message (a no-op unless
 *       SLACK_ALERT_WEBHOOK_URL is set on the server; at most 10 per run plus
 *       one summing up the rest). Slack posts are started and not awaited,
 *       so a hanging webhook never holds the shared scheduler worker. Socket
 *       and Slack carry ids, the service, the city and counts only: no
 *       customer or provider name, phone or address.
 *   listAlerts        the open (or all) alerts, red first, oldest first.
 *   acknowledgeAlert  an admin takes an alert; audit-logged as
 *       marketplace_alert_acknowledged on the booking.
 *
 * Read-only towards the marketplace: the sweep writes only
 * marketplace_alerts, and acknowledging writes only that row and its
 * admin_actions entry. Nothing here notifies a provider, changes a booking,
 * quote, invite or offer, or feeds dispatch, ranking or quality scores (E33,
 * E47).
 */
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { createAppError } from '../middleware/error.middleware';
import * as settingsService from './settings.service';
import * as socketService from './socket.service';
import { sendSlackAlert, type Severity, type SlackAlertInput } from './slack-alert.service';
import {
  ACCEPTED_QUOTE_EXISTS_SQL, LIVE_QUOTE_EXISTS_SQL, OPEN_REQUEST_WHERE_SQL, ROUND_ANCHOR_SQL, WAIT_ANCHOR_SQL,
} from './marketplace-health.service';

export const ALERT_KINDS = [
  'request_waiting_amber', 'request_waiting_red', 'request_needs_ops', 'request_unfilled',
] as const;
export type AlertKind = typeof ALERT_KINDS[number];
export type AlertSeverity = 'amber' | 'red';

/** First pg_try_advisory_xact_lock key for the sweep (merged.md section 2.7); the second is the schema. */
export const SWEEP_LOCK_KEY = 718200186;
/** At most this many alert:new events per sweep. */
const SOCKET_EMIT_CAP = 50;
/** At most this many single Slack messages per sweep; the rest are summed up in one more. */
const SLACK_MESSAGE_CAP = 10;
/** An unfilled alert covers requests that closed within this window. */
const UNFILLED_WINDOW_HOURS = 24;

export function alertSeverity(kind: AlertKind): AlertSeverity {
  return kind === 'request_waiting_amber' ? 'amber' : 'red';
}

interface RaisedAlertRow {
  id: string;
  booking_id: string;
  kind: AlertKind;
  request_round: number;
  threshold_minutes: number | null;
  raised_at: Date;
  details: Record<string, unknown>;
}

export interface SweepResult {
  raised: number;
  resolved: number;
  /** Set when this run did nothing: another sweep held the lock, or a row lock timed out. */
  skipped?: 'locked' | 'busy';
}

const RAISED_COLUMNS = 'id, booking_id, kind, request_round, threshold_minutes, raised_at, details';

/**
 * Counts for an alert's details (no PII): providers pushed and providers who
 * opened the request in round `round`, and quotes the customer declined.
 */
function countsLateral(bookingRef: string, roundRef: string): string {
  return `CROSS JOIN LATERAL (
      SELECT (SELECT COUNT(*)::int FROM job_request_invites ci
               WHERE ci.booking_id = ${bookingRef} AND ci.round = ${roundRef} AND ci.source = 'push') AS notified,
             (SELECT COUNT(*)::int FROM job_request_invites ci
               WHERE ci.booking_id = ${bookingRef} AND ci.round = ${roundRef} AND ci.viewed_at IS NOT NULL) AS viewed,
             (SELECT COUNT(*)::int FROM booking_quotes cq
               WHERE cq.booking_id = ${bookingRef} AND cq.declined_at IS NOT NULL) AS declined_quotes
    ) counts`;
}

/**
 * Open quote requests with no live quote and when their wait began (the
 * round's opening, or its last quote's lapse if later): the wait every
 * waiting alert measures.
 */
const OPEN_WAIT_CTE = `open_wait AS (
    SELECT b.id AS booking_id, b.request_round AS round, ${WAIT_ANCHOR_SQL} AS anchor_at
      FROM bookings b
     WHERE ${OPEN_REQUEST_WHERE_SQL}
       AND NOT ${LIVE_QUOTE_EXISTS_SQL}
  )`;

function raiseWaitingSql(kind: 'request_waiting_amber' | 'request_waiting_red'): string {
  const band = kind === 'request_waiting_red'
    ? 'w.anchor_at <= NOW() - make_interval(mins => $1::int)'
    // Amber only inside the band between the two thresholds, and never next
    // to a red already raised for the round (red thresholds can be lowered).
    : `w.anchor_at <= NOW() - make_interval(mins => $1::int)
       AND w.anchor_at > NOW() - make_interval(mins => $3::int)
       AND NOT EXISTS (SELECT 1 FROM marketplace_alerts r
                        WHERE r.booking_id = w.booking_id AND r.request_round = w.round
                          AND r.kind = 'request_waiting_red')`;
  // A red alert keeps the "being handled" marker of the open amber it
  // replaces (integrated review 2026-10-14), so staff already calling
  // providers are not shown as unhandled and duplicated by a colleague. The
  // red row is still new, so alert:new and Slack still announce it.
  const handled = kind === 'request_waiting_red'
    ? `LEFT JOIN marketplace_alerts amber
              ON amber.booking_id = w.booking_id AND amber.request_round = w.round
             AND amber.kind = 'request_waiting_amber' AND amber.resolved_at IS NULL`
    : '';
  const handledColumns = kind === 'request_waiting_red' ? 'amber.acknowledged_by, amber.acknowledged_at' : 'NULL::uuid, NULL::timestamptz';
  return `WITH ${OPEN_WAIT_CTE}
    INSERT INTO marketplace_alerts (booking_id, kind, request_round, anchor_at, threshold_minutes, details,
                                    acknowledged_by, acknowledged_at)
    SELECT w.booking_id, '${kind}', w.round, w.anchor_at, $1::int,
           jsonb_build_object(
             'waitMinutes', FLOOR(EXTRACT(EPOCH FROM (NOW() - w.anchor_at)) / 60)::int,
             'notified', counts.notified, 'viewed', counts.viewed, 'declinedQuotes', counts.declined_quotes),
           ${handledColumns}
      FROM open_wait w
      ${countsLateral('w.booking_id', 'w.round')}
      ${handled}
     WHERE ${band}
       AND w.anchor_at >= NOW() - make_interval(hours => $2::int)
    ON CONFLICT ON CONSTRAINT marketplace_alerts_once_per_round DO NOTHING
    RETURNING ${RAISED_COLUMNS}`;
}

const RESOLVE_WAITING_SQL = `UPDATE marketplace_alerts a
     SET resolved_at = NOW(), resolution = r.resolution
    FROM (
      SELECT a2.id,
             CASE
               WHEN ${ACCEPTED_QUOTE_EXISTS_SQL} THEN 'quote_accepted'
               WHEN ${LIVE_QUOTE_EXISTS_SQL} THEN 'quote_received'
               WHEN b.status NOT IN ('requested', 'quoted') OR b.provider_id IS NOT NULL THEN 'booking_closed'
               WHEN b.request_round <> a2.request_round THEN 'reopened'
               WHEN ${WAIT_ANCHOR_SQL} < NOW() - make_interval(hours => $1::int) THEN 'aged_out'
             END AS resolution
        FROM marketplace_alerts a2
        JOIN bookings b ON b.id = a2.booking_id
       WHERE a2.resolved_at IS NULL
         AND a2.kind IN ('request_waiting_amber', 'request_waiting_red')
    ) r
   WHERE a.id = r.id AND r.resolution IS NOT NULL
  RETURNING a.id`;

const RESOLVE_NEEDS_OPS_SQL = `UPDATE marketplace_alerts a
     SET resolved_at = NOW(),
         resolution = CASE WHEN ${ACCEPTED_QUOTE_EXISTS_SQL} THEN 'quote_accepted' ELSE 'booking_closed' END
    FROM bookings b
   WHERE b.id = a.booking_id
     AND a.kind = 'request_needs_ops' AND a.resolved_at IS NULL
     AND (${ACCEPTED_QUOTE_EXISTS_SQL} OR b.status NOT IN ('requested', 'quoted') OR b.provider_id IS NOT NULL)
  RETURNING a.id`;

const ESCALATE_AMBER_SQL = `UPDATE marketplace_alerts a
     SET resolved_at = NOW(), resolution = 'escalated'
   WHERE a.kind = 'request_waiting_amber' AND a.resolved_at IS NULL
     AND EXISTS (SELECT 1 FROM marketplace_alerts r
                  WHERE r.booking_id = a.booking_id AND r.request_round = a.request_round
                    AND r.kind = 'request_waiting_red')
  RETURNING a.id`;

/** One needs_ops alert at a time per request: none while an earlier one is still open. */
const RAISE_NEEDS_OPS_SQL = `INSERT INTO marketplace_alerts (booking_id, kind, request_round, anchor_at, threshold_minutes, details)
  SELECT b.id, 'request_needs_ops', b.request_round, ${ROUND_ANCHOR_SQL}, NULL,
         jsonb_build_object(
           'reason', b.request_ops_review_reason,
           'declinedRounds', b.request_declined_rounds,
           'notified', counts.notified, 'viewed', counts.viewed, 'declinedQuotes', counts.declined_quotes)
    FROM bookings b
    ${countsLateral('b.id', 'b.request_round')}
   WHERE ${OPEN_REQUEST_WHERE_SQL}
     AND b.request_ops_review_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM marketplace_alerts o
                      WHERE o.booking_id = b.id AND o.kind = 'request_needs_ops' AND o.resolved_at IS NULL)
  ON CONFLICT ON CONSTRAINT marketplace_alerts_once_per_round DO NOTHING
  RETURNING ${RAISED_COLUMNS}`;

const RAISE_UNFILLED_SQL = `INSERT INTO marketplace_alerts (booking_id, kind, request_round, anchor_at, threshold_minutes, details)
  SELECT b.id, 'request_unfilled', b.request_round, ${ROUND_ANCHOR_SQL}, NULL,
         jsonb_build_object(
           'closedBy', CASE WHEN b.status = 'cancelled_by_customer' THEN 'customer'
                            WHEN b.status = 'cancelled_by_provider' THEN 'provider'
                            ELSE 'system' END,
           'waitMinutes', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(b.cancelled_at, b.updated_at) - ${ROUND_ANCHOR_SQL})) / 60))::int,
           'notified', counts.notified, 'viewed', counts.viewed, 'declinedQuotes', counts.declined_quotes)
    FROM bookings b
    ${countsLateral('b.id', 'b.request_round')}
   WHERE b.booking_type = 'quote_based'
     AND b.status IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
     AND COALESCE(b.cancelled_at, b.updated_at) >= NOW() - make_interval(hours => ${UNFILLED_WINDOW_HOURS})
     AND NOT EXISTS (SELECT 1 FROM booking_quotes uq WHERE uq.booking_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM admin_actions aa
                      WHERE aa.target_type = 'booking' AND aa.target_id = b.id
                        AND aa.action_type = 'booking_cancelled')
     AND (b.status <> 'cancelled_by_customer'
          OR COALESCE(b.cancelled_at, b.updated_at) - ${ROUND_ANCHOR_SQL} >= make_interval(mins => $1::int))
  ON CONFLICT ON CONSTRAINT marketplace_alerts_once_per_round DO NOTHING
  RETURNING ${RAISED_COLUMNS}`;

/**
 * The one-minute check. Returns counts only (the scheduler logs them).
 */
export async function sweepMarketplaceAlerts(): Promise<SweepResult> {
  const policy = await settingsService.getMarketplaceAlertPolicy();
  let outcome: { raised: RaisedAlertRow[]; resolved: number } | null;
  try {
    outcome = await db.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await client.query("SET LOCAL lock_timeout = '2s'");
      // Advisory locks are per database, not per schema. The second key
      // scopes the lock to the schema holding marketplace_alerts (always
      // 'public' on live, so live has exactly one sweep lock); separate
      // schemas in one database, such as the isolated test schemas, do not
      // block each other.
      const lock = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_xact_lock($1::int, hashtext(current_schema())) AS locked',
        [SWEEP_LOCK_KEY],
      );
      if (lock.rows[0]?.locked !== true) return null;

      let resolved = 0;
      resolved += (await client.query(RESOLVE_WAITING_SQL, [policy.lookbackHours])).rowCount ?? 0;
      resolved += (await client.query(RESOLVE_NEEDS_OPS_SQL)).rowCount ?? 0;

      const raised: RaisedAlertRow[] = [];
      raised.push(...(await client.query<RaisedAlertRow>(
        raiseWaitingSql('request_waiting_red'), [policy.redMinutes, policy.lookbackHours],
      )).rows);
      raised.push(...(await client.query<RaisedAlertRow>(
        raiseWaitingSql('request_waiting_amber'), [policy.amberMinutes, policy.lookbackHours, policy.redMinutes],
      )).rows);
      resolved += (await client.query(ESCALATE_AMBER_SQL)).rowCount ?? 0;
      raised.push(...(await client.query<RaisedAlertRow>(RAISE_NEEDS_OPS_SQL)).rows);
      raised.push(...(await client.query<RaisedAlertRow>(RAISE_UNFILLED_SQL, [policy.amberMinutes])).rows);
      return { raised, resolved };
    });
  } catch (err) {
    // 55P03 lock_not_available: a booking row stayed locked past lock_timeout.
    // Nothing was written (the transaction rolled back); the next minute retries.
    if ((err as { code?: string }).code === '55P03') {
      logger.warn('Marketplace alert sweep skipped: a request row stayed locked; retrying next minute');
      return { raised: 0, resolved: 0, skipped: 'busy' };
    }
    throw err;
  }
  if (!outcome) return { raised: 0, resolved: 0, skipped: 'locked' };

  await announceNewAlerts(outcome.raised);
  return { raised: outcome.raised.length, resolved: outcome.resolved };
}

interface AlertContextRow {
  id: string;
  service_name: string;
  city: string | null;
}

const SLACK_TITLES: Readonly<Record<AlertKind, (row: RaisedAlertRow) => string>> = {
  request_waiting_amber: (row) => `Quote request waiting ${row.threshold_minutes}+ min with no quote`,
  request_waiting_red: (row) => `Quote request waiting ${row.threshold_minutes}+ min with no quote (red)`,
  request_needs_ops: () => 'Quote request needs back-office review',
  request_unfilled: () => 'Quote request closed with no quote',
};

function detailNumber(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function slackMessageFor(row: RaisedAlertRow, context: AlertContextRow | undefined): SlackAlertInput {
  const service = context?.service_name ?? 'A service';
  const city = context?.city ?? 'Unknown city';
  const waited = detailNumber(row.details, 'waitMinutes');
  const notified = detailNumber(row.details, 'notified') ?? 0;
  const viewed = detailNumber(row.details, 'viewed') ?? 0;
  const severity: Severity = row.kind === 'request_waiting_amber' ? 'warning' : 'error';
  const fields = [
    { key: 'Service', value: service },
    { key: 'City', value: city },
    { key: 'Round', value: String(row.request_round) },
    { key: 'Providers notified / opened', value: `${notified} / ${viewed}` },
    { key: 'Booking', value: row.booking_id },
  ];
  if (waited !== null) fields.splice(2, 0, { key: 'Waited', value: `${waited} min` });
  return {
    title: SLACK_TITLES[row.kind](row),
    body: `${service} in ${city}. Open Marketplace in the admin to call providers or follow up.`,
    severity,
    fields,
  };
}

/** After commit, best effort: alert:new once per new alert, then Slack (not awaited). */
async function announceNewAlerts(raised: RaisedAlertRow[]): Promise<void> {
  if (raised.length === 0) return;
  for (const row of raised.slice(0, SOCKET_EMIT_CAP)) {
    try {
      socketService.emitAdminEvent(socketService.ADMIN_EVENTS.ALERT_NEW, {
        id: row.id,
        source: 'marketplace',
        kind: row.kind,
        severity: alertSeverity(row.kind),
        bookingId: row.booking_id,
        round: Number(row.request_round),
        raisedAt: new Date(row.raised_at).toISOString(),
      });
    } catch (err) {
      logger.warn('Marketplace alert socket emit failed', { alertId: row.id, error: String(err) });
    }
  }

  let contexts = new Map<string, AlertContextRow>();
  try {
    const result = await db.query<AlertContextRow>(
      `SELECT b.id, COALESCE(sub.name, sc.name, 'A service') AS service_name, NULLIF(TRIM(b.city), '') AS city
         FROM bookings b
         LEFT JOIN service_categories sc ON sc.id = b.category_id
         LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
        WHERE b.id = ANY($1::uuid[])`,
      [[...new Set(raised.map((row) => row.booking_id))]],
    );
    contexts = new Map(result.rows.map((row) => [row.id, row]));
  } catch (err) {
    logger.warn('Marketplace alert Slack context lookup failed', { error: String(err) });
  }

  // Started, never awaited (as reconciliation.service does): the sweep runs
  // in the one shared scheduler worker and the webhook post has no timeout,
  // so a slow or hanging Slack must not hold the engine's own jobs behind it.
  // sendSlackAlert never rejects; it logs its own failures.
  try {
    for (const row of raised.slice(0, SLACK_MESSAGE_CAP)) {
      void sendSlackAlert(slackMessageFor(row, contexts.get(row.booking_id)));
    }
    if (raised.length > SLACK_MESSAGE_CAP) {
      const more = raised.length - SLACK_MESSAGE_CAP;
      void sendSlackAlert({
        title: `${more} more quote request alerts`,
        body: 'Open Marketplace in the admin to see every request that needs attention.',
        severity: raised.slice(SLACK_MESSAGE_CAP).some((row) => row.kind !== 'request_waiting_amber') ? 'error' : 'warning',
      });
    }
  } catch (err) {
    logger.warn('Marketplace alert Slack message could not be started', { error: String(err) });
  }
}

// ────────────────────────────────────────────────────────────────────
// Reading and acknowledging
// ────────────────────────────────────────────────────────────────────

export interface MarketplaceAlert {
  id: string;
  bookingId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  round: number;
  /** When the measured wait began. */
  anchorAt: string;
  thresholdMinutes: number | null;
  /** Counts recorded when the alert was raised (no PII). */
  details: Record<string, unknown>;
  raisedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string | null } | null;
  resolvedAt: string | null;
  resolution: string | null;
  serviceName: string | null;
  barangay: string | null;
  city: string | null;
  /** Live wait for an open waiting alert; null otherwise. */
  currentWaitMinutes: number | null;
}

interface AlertDbRow {
  id: string;
  booking_id: string;
  kind: AlertKind;
  request_round: number;
  anchor_at: Date;
  threshold_minutes: number | null;
  details: Record<string, unknown> | null;
  raised_at: Date;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  resolved_at: Date | null;
  resolution: string | null;
  service_name: string | null;
  barangay: string | null;
  city: string | null;
  current_wait_minutes: number | null;
}

const ALERT_SELECT = `SELECT a.id, a.booking_id, a.kind, a.request_round, a.anchor_at, a.threshold_minutes, a.details,
         a.raised_at, a.acknowledged_at, a.acknowledged_by,
         NULLIF(TRIM(CONCAT_WS(' ', au.first_name, au.last_name)), '') AS acknowledged_by_name,
         a.resolved_at, a.resolution,
         COALESCE(sub.name, sc.name) AS service_name, b.barangay, b.city,
         CASE WHEN a.resolved_at IS NULL AND a.kind IN ('request_waiting_amber', 'request_waiting_red')
              THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - a.anchor_at)) / 60))::int END AS current_wait_minutes
    FROM marketplace_alerts a
    JOIN bookings b ON b.id = a.booking_id
    LEFT JOIN service_categories sc ON sc.id = b.category_id
    LEFT JOIN service_subcategories sub ON sub.id = b.subcategory_id
    LEFT JOIN users au ON au.id = a.acknowledged_by`;

function formatAlert(row: AlertDbRow): MarketplaceAlert {
  return {
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    severity: alertSeverity(row.kind),
    round: Number(row.request_round),
    anchorAt: new Date(row.anchor_at).toISOString(),
    thresholdMinutes: row.threshold_minutes === null ? null : Number(row.threshold_minutes),
    details: row.details ?? {},
    raisedAt: new Date(row.raised_at).toISOString(),
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
    acknowledgedBy: row.acknowledged_by ? { id: row.acknowledged_by, name: row.acknowledged_by_name } : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    resolution: row.resolution,
    serviceName: row.service_name,
    barangay: row.barangay,
    city: row.city,
    currentWaitMinutes: row.current_wait_minutes === null ? null : Number(row.current_wait_minutes),
  };
}

export interface AlertListMeta {
  openCount: number;
  unacknowledgedCount: number;
  /** Open alerts that are red (red, needs_ops or unfilled). */
  openRedCount: number;
  amberMinutes: number;
  redMinutes: number;
}

/**
 * Open alerts (resolved_at IS NULL, acknowledged or not), or every alert.
 * Open first; among open alerts red before amber, then oldest first; resolved
 * alerts newest first.
 */
export async function listAlerts(opts: { status: 'open' | 'all'; limit: number }): Promise<{
  alerts: MarketplaceAlert[];
  meta: AlertListMeta;
}> {
  const policy = await settingsService.getMarketplaceAlertPolicy();
  const [rows, counts] = await Promise.all([
    db.query<AlertDbRow>(
      `${ALERT_SELECT}
        WHERE ($1::text = 'all' OR a.resolved_at IS NULL)
        ORDER BY (a.resolved_at IS NULL) DESC,
                 CASE WHEN a.resolved_at IS NULL AND a.kind <> 'request_waiting_amber' THEN 0 ELSE 1 END,
                 CASE WHEN a.resolved_at IS NULL THEN a.raised_at END ASC,
                 a.resolved_at DESC, a.id
        LIMIT $2`,
      [opts.status, opts.limit],
    ),
    db.query<{ open_count: number; unacknowledged_count: number; open_red_count: number }>(
      `SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open_count,
              COUNT(*) FILTER (WHERE resolved_at IS NULL AND acknowledged_at IS NULL)::int AS unacknowledged_count,
              COUNT(*) FILTER (WHERE resolved_at IS NULL AND kind <> 'request_waiting_amber')::int AS open_red_count
         FROM marketplace_alerts`,
    ),
  ]);
  const count = counts.rows[0]!;
  return {
    alerts: rows.rows.map(formatAlert),
    meta: {
      openCount: Number(count.open_count),
      unacknowledgedCount: Number(count.unacknowledged_count),
      openRedCount: Number(count.open_red_count),
      amberMinutes: policy.amberMinutes,
      redMinutes: policy.redMinutes,
    },
  };
}

/**
 * An admin takes an alert: who and when are stored and one
 * marketplace_alert_acknowledged row is written to admin_actions on the
 * booking, in one transaction. An unfilled alert is resolved by its
 * acknowledgement; a waiting or needs_ops alert stays open (muted) until the
 * request changes. 404 for an unknown alert, 409 when already acknowledged.
 */
export async function acknowledgeAlert(input: {
  alertId: string;
  adminId: string;
  note?: string | null;
}): Promise<MarketplaceAlert> {
  const note = input.note?.trim() ? input.note.trim() : null;
  return db.transaction(async (client) => {
    const updated = await client.query<{ id: string; booking_id: string; kind: AlertKind; request_round: number }>(
      `UPDATE marketplace_alerts
          SET acknowledged_by = $2,
              acknowledged_at = NOW(),
              resolved_at = CASE WHEN kind = 'request_unfilled' AND resolved_at IS NULL THEN NOW() ELSE resolved_at END,
              resolution = CASE WHEN kind = 'request_unfilled' AND resolved_at IS NULL THEN 'acknowledged' ELSE resolution END
        WHERE id = $1 AND acknowledged_at IS NULL
        RETURNING id, booking_id, kind, request_round`,
      [input.alertId, input.adminId],
    );
    const alert = updated.rows[0];
    if (!alert) {
      const existing = await client.query('SELECT 1 FROM marketplace_alerts WHERE id = $1', [input.alertId]);
      if (existing.rows.length === 0) throw createAppError('Alert not found.', 404);
      throw createAppError('This alert has already been acknowledged.', 409);
    }
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'marketplace_alert_acknowledged', 'booking', $2, $3::jsonb, $4)`,
      [
        input.adminId,
        alert.booking_id,
        JSON.stringify({ alertId: alert.id, kind: alert.kind, round: Number(alert.request_round) }),
        note,
      ],
    );
    const row = await client.query<AlertDbRow>(`${ALERT_SELECT} WHERE a.id = $1`, [alert.id]);
    logger.info('Marketplace alert acknowledged', { alertId: alert.id, kind: alert.kind, adminId: input.adminId });
    return formatAlert(row.rows[0]!);
  });
}
