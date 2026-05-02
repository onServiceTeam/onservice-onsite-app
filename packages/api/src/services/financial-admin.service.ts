/**
 * Phase 08 — Financial admin aggregation service.
 *
 * READ-ONLY aggregation that powers the admin Financials page (7 tabs):
 * Overview, Revenue Breakdown, Escrow, Payouts, Guarantee Fund,
 * Reconciliation, BIR Reports, and Receipts search.
 *
 * Sacred-file note: this service performs ZERO money writes. It does NOT
 * create wallet_transactions, does NOT touch wallet balances, and does NOT
 * insert audit rows. All it does is SELECT/aggregate. Any function that
 * needs to query an optional Phase-08 table (`payouts`, `official_receipts`,
 * `bir_2307_batches`, `vat_monthly_reports`, `reconciliation_snapshots`)
 * first probes `to_regclass()` and returns zero/empty when the table is not
 * yet present so the Financials page never throws on a fresh database.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const GUARANTEE_FLOOR_CENTAVOS = 1_000_000_00; // ₱1,000,000

/**
 * Validates that `from`/`to` are YYYY-MM-DD and that from <= to.
 * Throws a 400 AppError on failure.
 */
function assertDateRange(from: string, to: string): void {
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
    throw createAppError('Invalid date format. Use YYYY-MM-DD.', 400);
  }
  if (from > to) {
    throw createAppError('"from" date must be on or before "to" date.', 400);
  }
}

/**
 * Clamps a caller-provided limit to [1, MAX_LIMIT], defaulting to DEFAULT_LIMIT
 * when omitted or non-positive.
 */
function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

/**
 * Clamps a caller-provided offset to [0, +Infinity).
 */
function clampOffset(offset?: number): number {
  if (!offset || offset < 0) return 0;
  return Math.trunc(offset);
}

/**
 * Returns true if the given table exists in the current schema. Uses
 * `to_regclass()` so the probe itself never throws on a missing table.
 */
async function tableExists(tableName: string): Promise<boolean> {
  const r = await db.query<{ exists: string | null }>(
    `SELECT to_regclass($1)::text AS exists`,
    [tableName],
  );
  return r.rows[0]?.exists != null;
}

/**
 * "Completed booking" set used by all GMV / revenue queries. Mirrors the
 * conventions already used by `customer-admin.service.ts` (`confirmed` or
 * `paid_out`) plus `completed_by_provider` so the Overview tab matches what
 * providers see in their own dashboard.
 */
const COMPLETED_STATUSES_SQL = `('completed_by_provider', 'confirmed', 'paid_out')`;

// ─────────────────────────────────────────────────────────────────
// Types — Overview tab
// ─────────────────────────────────────────────────────────────────

export interface FinancialOverview {
  range: { from: string; to: string };
  gmvCentavos: number;
  revenueCentavos: number;
  refundsCentavos: number;
  bookingsCompleted: number;
  averageTicketCentavos: number;
  netRevenueCentavos: number;
}

export interface RevenueByDimension {
  dimension: string;
  label: string;
  revenueCentavos: number;
  bookings: number;
}

// ─────────────────────────────────────────────────────────────────
// Types — Escrow tab
// ─────────────────────────────────────────────────────────────────

export interface EscrowSummary {
  totalInEscrowCentavos: number;
  pendingReleaseCount: number;
  agingBuckets: {
    bucket: '0-24h' | '24-48h' | '48-168h' | '168h+';
    count: number;
    totalCentavos: number;
  }[];
  pendingReleaseList: Array<{
    bookingId: string;
    customerName: string;
    providerName: string;
    amountCentavos: number;
    completedAt: string | null;
    ageHours: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────
// Types — Payouts tab
// ─────────────────────────────────────────────────────────────────

export interface PayoutsSummary {
  pendingCount: number;
  pendingTotalCentavos: number;
  todayCompletedCount: number;
  todayCompletedCentavos: number;
  failedCount: number;
  recentFailed: Array<{
    id: string;
    providerId: string;
    providerName: string;
    amountCentavos: number;
    failedAt: string;
    failureReason: string | null;
  }>;
  upcomingScheduledCount: number;
}

// ─────────────────────────────────────────────────────────────────
// Types — Guarantee Fund tab
// ─────────────────────────────────────────────────────────────────

export interface GuaranteeFundSummary {
  currentBalanceCentavos: number;
  inflow30dCentavos: number;
  outflow30dCentavos: number;
  net30dCentavos: number;
  averageMonthlyOutflowCentavos: number;
  runwayMonths: number;
  needsReplenishment: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Types — Reconciliation tab
// ─────────────────────────────────────────────────────────────────

export interface ReconciliationOverview {
  recent: Array<{
    id: string;
    snapshotDate: string;
    paymongoBalanceCentavos: number | null;
    expectedTotalCentavos: number;
    discrepancyCentavos: number;
    alertSent: boolean;
  }>;
  openAlertsCount: number;
  lastSnapshotDate: string | null;
  daysSinceLastSnapshot: number | null;
}

// ─────────────────────────────────────────────────────────────────
// Types — BIR Reports tab
// ─────────────────────────────────────────────────────────────────

export interface BirReportsOverview {
  vatMonthly: Array<{
    year: number;
    month: number;
    outputVatCentavos: number;
    vatPayableCentavos: number;
    finalized: boolean;
    pdfUrl: string | null;
  }>;
  q2307Batches: Array<{
    year: number;
    quarter: number;
    batchCount: number;
    totalWithheldCentavos: number;
  }>;
  annualSummary: {
    year: number;
    totalOutputVatCentavos: number;
    totalVatPayableCentavos: number;
    monthsFinalized: number;
  };
}

// ─────────────────────────────────────────────────────────────────
// Types — Receipts tab
// ─────────────────────────────────────────────────────────────────

export interface ReceiptSearchResult {
  id: string;
  orNumber: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  providerId: string | null;
  providerName: string | null;
  issuedAt: string;
  grossCentavos: number;
  vatCentavos: number;
  isCancellation: boolean;
  pdfUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Overview tab
// ─────────────────────────────────────────────────────────────────

interface OverviewBookingRow {
  gmv: string | null;
  bookings_completed: string;
}

interface OverviewTxnRow {
  revenue: string | null;
  refunds: string | null;
}

/**
 * Tab 1 — top-of-page KPIs for the Financials page. GMV is summed from
 * `bookings.total_amount` for completed bookings whose `completed_at` falls
 * inside the inclusive [from, to] window (00:00:00 UTC of `from` through
 * 23:59:59.999 UTC of `to`). Platform revenue is summed from
 * `wallet_transactions` of types 'commission' and 'service_fee' over the
 * same window. Refunds use type='refund' and are taken as the absolute
 * value because refund rows are recorded as negative amounts on the
 * customer/escrow wallet but as positive amounts on the platform_revenue
 * wallet — `ABS()` makes either ledger orientation safe.
 */
export async function getFinancialOverview(
  from: string,
  to: string,
): Promise<FinancialOverview> {
  assertDateRange(from, to);

  const [bookingsRes, txnRes] = await Promise.all([
    db.query<OverviewBookingRow>(
      `SELECT
         COALESCE(SUM(total_amount), 0)::text AS gmv,
         COUNT(*)::text                       AS bookings_completed
         FROM bookings
        WHERE status IN ${COMPLETED_STATUSES_SQL}
          AND completed_at IS NOT NULL
          AND completed_at >= ($1::date)
          AND completed_at <  ($2::date + INTERVAL '1 day')`,
      [from, to],
    ),
    db.query<OverviewTxnRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('commission', 'service_fee') THEN ABS(amount) ELSE 0 END), 0)::text AS revenue,
         COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0)::text                       AS refunds
         FROM wallet_transactions
        WHERE created_at >= ($1::date)
          AND created_at <  ($2::date + INTERVAL '1 day')`,
      [from, to],
    ),
  ]);

  const gmv = Number(bookingsRes.rows[0]?.gmv ?? 0);
  const bookingsCompleted = Number(bookingsRes.rows[0]?.bookings_completed ?? 0);
  const revenue = Number(txnRes.rows[0]?.revenue ?? 0);
  const refunds = Number(txnRes.rows[0]?.refunds ?? 0);
  const averageTicket = bookingsCompleted > 0 ? Math.round(gmv / bookingsCompleted) : 0;

  return {
    range: { from, to },
    gmvCentavos: gmv,
    revenueCentavos: revenue,
    refundsCentavos: refunds,
    bookingsCompleted,
    averageTicketCentavos: averageTicket,
    netRevenueCentavos: revenue - refunds,
  };
}

interface RevenueByCategoryRow {
  category_id: string | null;
  category_name: string | null;
  revenue: string | null;
  bookings: string;
}

/**
 * Tab 2 — revenue grouped by service category. Revenue here is the sum of
 * `total_amount` for completed bookings in the window grouped by
 * `bookings.category_id`, joined to `service_categories.name`.
 */
export async function getRevenueByCategory(
  from: string,
  to: string,
): Promise<RevenueByDimension[]> {
  assertDateRange(from, to);

  const r = await db.query<RevenueByCategoryRow>(
    `SELECT
       b.category_id::text                        AS category_id,
       sc.name                                    AS category_name,
       COALESCE(SUM(b.total_amount), 0)::text     AS revenue,
       COUNT(*)::text                             AS bookings
       FROM bookings b
       LEFT JOIN service_categories sc ON sc.id = b.category_id
      WHERE b.status IN ${COMPLETED_STATUSES_SQL}
        AND b.completed_at IS NOT NULL
        AND b.completed_at >= ($1::date)
        AND b.completed_at <  ($2::date + INTERVAL '1 day')
      GROUP BY b.category_id, sc.name
      ORDER BY revenue DESC`,
    [from, to],
  );

  return r.rows.map((row) => ({
    dimension: row.category_id ?? 'unknown',
    label: row.category_name ?? 'Uncategorized',
    revenueCentavos: Number(row.revenue ?? 0),
    bookings: Number(row.bookings),
  }));
}

interface RevenueByCityRow {
  city: string | null;
  revenue: string | null;
  bookings: string;
}

/**
 * Tab 2 — revenue grouped by `bookings.city`. Top-N (default 25, capped at
 * MAX_LIMIT) ordered by revenue descending. Empty/NULL cities are folded
 * into a single 'Unknown' row.
 */
export async function getRevenueByCity(
  from: string,
  to: string,
  limit?: number,
): Promise<RevenueByDimension[]> {
  assertDateRange(from, to);
  const safeLimit = clampLimit(limit);

  const r = await db.query<RevenueByCityRow>(
    `SELECT
       NULLIF(TRIM(city), '')                     AS city,
       COALESCE(SUM(total_amount), 0)::text       AS revenue,
       COUNT(*)::text                             AS bookings
       FROM bookings
      WHERE status IN ${COMPLETED_STATUSES_SQL}
        AND completed_at IS NOT NULL
        AND completed_at >= ($1::date)
        AND completed_at <  ($2::date + INTERVAL '1 day')
      GROUP BY NULLIF(TRIM(city), '')
      ORDER BY revenue DESC
      LIMIT $3`,
    [from, to, safeLimit],
  );

  return r.rows.map((row) => {
    const city = row.city ?? 'Unknown';
    return {
      dimension: city.toLowerCase(),
      label: city,
      revenueCentavos: Number(row.revenue ?? 0),
      bookings: Number(row.bookings),
    };
  });
}

interface RevenueByTierRow {
  tier: string | null;
  revenue: string | null;
  bookings: string;
}

/**
 * Tab 2 — revenue grouped by provider tier. Bookings without an assigned
 * provider (`provider_id IS NULL`) are excluded since they have no tier.
 */
export async function getRevenueByTier(
  from: string,
  to: string,
): Promise<RevenueByDimension[]> {
  assertDateRange(from, to);

  const r = await db.query<RevenueByTierRow>(
    `SELECT
       p.tier                                     AS tier,
       COALESCE(SUM(b.total_amount), 0)::text     AS revenue,
       COUNT(*)::text                             AS bookings
       FROM bookings b
       JOIN providers p ON p.id = b.provider_id
      WHERE b.status IN ${COMPLETED_STATUSES_SQL}
        AND b.completed_at IS NOT NULL
        AND b.completed_at >= ($1::date)
        AND b.completed_at <  ($2::date + INTERVAL '1 day')
      GROUP BY p.tier
      ORDER BY revenue DESC`,
    [from, to],
  );

  return r.rows.map((row) => {
    const tier = row.tier ?? 'unknown';
    return {
      dimension: tier,
      label: tier.charAt(0).toUpperCase() + tier.slice(1),
      revenueCentavos: Number(row.revenue ?? 0),
      bookings: Number(row.bookings),
    };
  });
}

interface RevenueByPaymentMethodRow {
  method: string | null;
  revenue: string | null;
  bookings: string;
}

/**
 * Tab 2 — revenue grouped by `bookings.payment_method`.
 *
 * MED-N11 fix: when bookings.payment_method is missing (older
 * schema), the function used to return a silent "all unknown"
 * placeholder. Operators couldn't distinguish "no data this
 * period" from "schema not migrated". Now returns a structured
 * result with a `degraded` flag + human-readable `message` so
 * the admin UI can show a banner ("Payment-method tracking
 * unavailable — apply migration X to enable").
 */
export interface RevenueByPaymentMethodResult {
  rows: RevenueByDimension[];
  degraded: boolean;
  message: string | null;
}

export async function getRevenueByPaymentMethod(
  from: string,
  to: string,
): Promise<RevenueByPaymentMethodResult> {
  assertDateRange(from, to);

  try {
    const r = await db.query<RevenueByPaymentMethodRow>(
      `SELECT
         NULLIF(TRIM(payment_method), '')         AS method,
         COALESCE(SUM(total_amount), 0)::text     AS revenue,
         COUNT(*)::text                           AS bookings
         FROM bookings
        WHERE status IN ${COMPLETED_STATUSES_SQL}
          AND completed_at IS NOT NULL
          AND completed_at >= ($1::date)
          AND completed_at <  ($2::date + INTERVAL '1 day')
        GROUP BY NULLIF(TRIM(payment_method), '')
        ORDER BY revenue DESC`,
      [from, to],
    );
    return {
      rows: r.rows.map((row) => {
        const method = row.method ?? 'unknown';
        return {
          dimension: method,
          label: method === 'unknown' ? 'Unknown' : method.toUpperCase(),
          revenueCentavos: Number(row.revenue ?? 0),
          bookings: Number(row.bookings),
        };
      }),
      degraded: false,
      message: null,
    };
  } catch (err) {
    // MED-N11 fix: surface the degradation to the caller (UI shows
    // banner) instead of silently returning an "all unknown" row.
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('getRevenueByPaymentMethod: query failed (likely missing column)', {
      error: errMsg,
    });
    return {
      rows: [],
      degraded: true,
      message: 'Payment-method revenue is unavailable. The bookings.payment_method column may be missing — apply outstanding migrations.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Escrow tab
// ─────────────────────────────────────────────────────────────────

interface EscrowWalletRow {
  available: string | null;
  pending: string | null;
}

interface EscrowPendingRow {
  booking_id: string;
  customer_name: string;
  provider_name: string | null;
  amount: string;
  completed_at: Date | null;
  age_hours: string;
  bucket: '0-24h' | '24-48h' | '48-168h' | '168h+';
}

/**
 * Tab 3 — escrow snapshot. Returns the total currently held in the
 * `platform_escrow` wallet plus a per-booking aging breakdown for bookings
 * that are completed but whose escrow has not yet been released. Two
 * queries: wallet balance + per-booking list (we derive aging buckets from
 * the same list to stay within the 3-query cap).
 */
export async function getEscrowSummary(): Promise<EscrowSummary> {
  // MED-N12 fix: pre-fix derived aging-bucket counts FROM the
  // LIMIT 500 list, so any backlog above 500 silently undercounted.
  // Now: separate aggregate query (no LIMIT) for the bucket
  // counts/totals, and the displayed list keeps its 500 cap to
  // bound payload size. The full count is exposed via
  // pendingReleaseCount so admin UI can show "showing 500 of N
  // total" when the list is truncated.
  const PENDING_LIST_LIMIT = 500;
  const [walletRes, aggRes, listRes] = await Promise.all([
    db.query<EscrowWalletRow>(
      `SELECT
         COALESCE(available_balance, 0)::text AS available,
         COALESCE(pending_balance, 0)::text   AS pending
         FROM wallets
        WHERE type = 'platform_escrow' AND user_id IS NULL
        LIMIT 1`,
    ),
    db.query<{ bucket: '0-24h' | '24-48h' | '48-168h' | '168h+'; count: string; total: string }>(
      `SELECT
         CASE
           WHEN b.completed_at IS NULL THEN '168h+'
           WHEN NOW() - b.completed_at < INTERVAL '24 hours'  THEN '0-24h'
           WHEN NOW() - b.completed_at < INTERVAL '48 hours'  THEN '24-48h'
           WHEN NOW() - b.completed_at < INTERVAL '168 hours' THEN '48-168h'
           ELSE '168h+'
         END                                          AS bucket,
         COUNT(*)::text                               AS count,
         COALESCE(SUM(b.total_amount), 0)::text       AS total
         FROM bookings b
        WHERE b.escrow_status = 'held'
          AND b.status IN ('completed_by_provider', 'confirmed')
        GROUP BY bucket`,
    ),
    db.query<EscrowPendingRow>(
      `SELECT
         b.id::text                                                       AS booking_id,
         TRIM(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')) AS customer_name,
         p.business_name                                                  AS provider_name,
         b.total_amount::text                                             AS amount,
         b.completed_at                                                   AS completed_at,
         GREATEST(EXTRACT(EPOCH FROM (NOW() - COALESCE(b.completed_at, b.scheduled_at))) / 3600.0, 0)::text AS age_hours,
         CASE
           WHEN b.completed_at IS NULL THEN '168h+'
           WHEN NOW() - b.completed_at < INTERVAL '24 hours'  THEN '0-24h'
           WHEN NOW() - b.completed_at < INTERVAL '48 hours'  THEN '24-48h'
           WHEN NOW() - b.completed_at < INTERVAL '168 hours' THEN '48-168h'
           ELSE '168h+'
         END                                                              AS bucket
         FROM bookings b
         JOIN users cu ON cu.id = b.customer_id
         LEFT JOIN providers p ON p.id = b.provider_id
        WHERE b.escrow_status = 'held'
          AND b.status IN ('completed_by_provider', 'confirmed')
        ORDER BY b.completed_at NULLS LAST
        LIMIT ${PENDING_LIST_LIMIT}`,
    ),
  ]);

  const available = Number(walletRes.rows[0]?.available ?? 0);
  const pending = Number(walletRes.rows[0]?.pending ?? 0);

  // MED-N12 fix: aging buckets sourced from the aggregate query so
  // they're correct even when the pending-list display is capped.
  const bucketTotals: Record<EscrowSummary['agingBuckets'][number]['bucket'], { count: number; total: number }> = {
    '0-24h': { count: 0, total: 0 },
    '24-48h': { count: 0, total: 0 },
    '48-168h': { count: 0, total: 0 },
    '168h+': { count: 0, total: 0 },
  };
  let totalPendingCount = 0;
  for (const row of aggRes.rows) {
    bucketTotals[row.bucket] = { count: Number(row.count), total: Number(row.total) };
    totalPendingCount += Number(row.count);
  }

  const pendingReleaseList: EscrowSummary['pendingReleaseList'] = listRes.rows.map((row) => ({
    bookingId: row.booking_id,
    customerName: row.customer_name || '(unknown)',
    providerName: row.provider_name ?? '(unassigned)',
    amountCentavos: Number(row.amount),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    ageHours: Math.round(Number(row.age_hours) * 10) / 10,
  }));

  const agingBuckets: EscrowSummary['agingBuckets'] = (
    ['0-24h', '24-48h', '48-168h', '168h+'] as const
  ).map((b) => ({ bucket: b, count: bucketTotals[b].count, totalCentavos: bucketTotals[b].total }));

  return {
    totalInEscrowCentavos: available + pending,
    pendingReleaseCount: totalPendingCount, // accurate count (was: list length)
    agingBuckets,
    pendingReleaseList,
  };
}

// ─────────────────────────────────────────────────────────────────
// Payouts tab
// ─────────────────────────────────────────────────────────────────

interface PayoutAggRow {
  pending_count: string;
  pending_total: string | null;
  today_completed_count: string;
  today_completed_total: string | null;
  failed_count: string;
}

interface PayoutFailedRow {
  id: string;
  provider_id: string;
  provider_name: string | null;
  amount: string;
  failed_at: Date;
  failure_reason: string | null;
}

/**
 * Tab 4 — payouts snapshot. Probes for the `payouts` table first; if it is
 * missing (very old schema) the dashboard receives all-zero counts so it
 * still renders. Schema notes:
 *  - `requested_at` is mapped to `created_at`
 *  - `failed_at`    is mapped to `created_at` (failure timestamp is not
 *    tracked separately on the existing `payouts` schema; we use the row
 *    creation time as a best-effort surrogate)
 *  - "today" uses the database server clock (UTC).
 *  - `upcomingScheduledCount` mirrors `pendingCount` because there is no
 *    separate "scheduled" status in the payouts state machine yet.
 */
export async function getPayoutsSummary(): Promise<PayoutsSummary> {
  if (!(await tableExists('payouts'))) {
    logger.warn('getPayoutsSummary: payouts table not present; returning zeros');
    return {
      pendingCount: 0,
      pendingTotalCentavos: 0,
      todayCompletedCount: 0,
      todayCompletedCentavos: 0,
      failedCount: 0,
      recentFailed: [],
      upcomingScheduledCount: 0,
    };
  }

  const [aggRes, failedRes] = await Promise.all([
    db.query<PayoutAggRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'processing')::text                                  AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'processing'), 0)::text                  AS pending_total,
         COUNT(*) FILTER (WHERE status = 'completed' AND completed_at::date = NOW()::date)::text   AS today_completed_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND completed_at::date = NOW()::date), 0)::text AS today_completed_total,
         COUNT(*) FILTER (WHERE status = 'failed')::text                                      AS failed_count
         FROM payouts`,
    ),
    db.query<PayoutFailedRow>(
      `SELECT
         po.id::text                                                       AS id,
         po.provider_id::text                                              AS provider_id,
         p.business_name                                                   AS provider_name,
         po.amount::text                                                   AS amount,
         COALESCE(po.completed_at, po.created_at)                          AS failed_at,
         po.failure_reason                                                 AS failure_reason
         FROM payouts po
         LEFT JOIN providers p ON p.id = po.provider_id
        WHERE po.status = 'failed'
        ORDER BY COALESCE(po.completed_at, po.created_at) DESC
        LIMIT 25`,
    ),
  ]);

  const a = aggRes.rows[0];
  const pendingCount = Number(a?.pending_count ?? 0);

  return {
    pendingCount,
    pendingTotalCentavos: Number(a?.pending_total ?? 0),
    todayCompletedCount: Number(a?.today_completed_count ?? 0),
    todayCompletedCentavos: Number(a?.today_completed_total ?? 0),
    failedCount: Number(a?.failed_count ?? 0),
    recentFailed: failedRes.rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      providerName: row.provider_name ?? '(unknown)',
      amountCentavos: Number(row.amount),
      failedAt: row.failed_at.toISOString(),
      failureReason: row.failure_reason,
    })),
    upcomingScheduledCount: pendingCount,
  };
}

// ─────────────────────────────────────────────────────────────────
// Guarantee Fund tab
// ─────────────────────────────────────────────────────────────────

interface GuaranteeWalletRow {
  wallet_id: string | null;
  available: string | null;
  pending: string | null;
}

interface GuaranteeFlowRow {
  inflow_30d: string | null;
  outflow_30d: string | null;
  outflow_90d: string | null;
}

/**
 * Tab 5 — guarantee fund snapshot. Inflows = positive amount transactions
 * recorded against the guarantee_fund wallet; outflows = absolute value of
 * negative amount transactions. Runway is current balance divided by the
 * average monthly outflow over the last 90 days. When the average outflow
 * is zero we return `Number.POSITIVE_INFINITY` (the API layer is expected
 * to JSON-serialise this as `null`).
 */
export async function getGuaranteeFundSummary(): Promise<GuaranteeFundSummary> {
  const walletRes = await db.query<GuaranteeWalletRow>(
    `SELECT
       id::text                                AS wallet_id,
       COALESCE(available_balance, 0)::text    AS available,
       COALESCE(pending_balance, 0)::text      AS pending
       FROM wallets
      WHERE type = 'guarantee_fund' AND user_id IS NULL
      LIMIT 1`,
  );

  const walletId = walletRes.rows[0]?.wallet_id ?? null;
  const balance =
    Number(walletRes.rows[0]?.available ?? 0) + Number(walletRes.rows[0]?.pending ?? 0);

  if (!walletId) {
    return {
      currentBalanceCentavos: balance,
      inflow30dCentavos: 0,
      outflow30dCentavos: 0,
      net30dCentavos: 0,
      averageMonthlyOutflowCentavos: 0,
      runwayMonths: Number.POSITIVE_INFINITY,
      needsReplenishment: balance < GUARANTEE_FLOOR_CENTAVOS,
    };
  }

  const flowRes = await db.query<GuaranteeFlowRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN amount > 0 AND created_at >= NOW() - INTERVAL '30 days'  THEN amount ELSE 0 END), 0)::text       AS inflow_30d,
       COALESCE(SUM(CASE WHEN amount < 0 AND created_at >= NOW() - INTERVAL '30 days'  THEN -amount ELSE 0 END), 0)::text      AS outflow_30d,
       COALESCE(SUM(CASE WHEN amount < 0 AND created_at >= NOW() - INTERVAL '90 days'  THEN -amount ELSE 0 END), 0)::text      AS outflow_90d
       FROM wallet_transactions
      WHERE wallet_id = $1`,
    [walletId],
  );

  const inflow30 = Number(flowRes.rows[0]?.inflow_30d ?? 0);
  const outflow30 = Number(flowRes.rows[0]?.outflow_30d ?? 0);
  const outflow90 = Number(flowRes.rows[0]?.outflow_90d ?? 0);
  const avgMonthlyOutflow = Math.round(outflow90 / 3);
  const runwayMonths =
    avgMonthlyOutflow > 0 ? balance / avgMonthlyOutflow : Number.POSITIVE_INFINITY;
  const needsReplenishment =
    runwayMonths < 3 || balance < GUARANTEE_FLOOR_CENTAVOS;

  return {
    currentBalanceCentavos: balance,
    inflow30dCentavos: inflow30,
    outflow30dCentavos: outflow30,
    net30dCentavos: inflow30 - outflow30,
    averageMonthlyOutflowCentavos: avgMonthlyOutflow,
    runwayMonths,
    needsReplenishment,
  };
}

// ─────────────────────────────────────────────────────────────────
// Reconciliation tab
// ─────────────────────────────────────────────────────────────────

interface ReconciliationRow {
  id: string;
  snapshot_date: Date;
  paymongo_balance: string | null;
  expected_total: string;
  discrepancy: string;
  alert_sent: boolean;
}

/**
 * Tab 6 — reconciliation snapshot list. Returns the 30 most recent snapshots
 * plus aggregate counters. Guarded with `to_regclass()` so a missing Phase
 * 08 migration does not throw on the Financials page.
 */
export async function getReconciliationOverview(): Promise<ReconciliationOverview> {
  if (!(await tableExists('reconciliation_snapshots'))) {
    return {
      recent: [],
      openAlertsCount: 0,
      lastSnapshotDate: null,
      daysSinceLastSnapshot: null,
    };
  }

  const r = await db.query<ReconciliationRow>(
    `SELECT
       id::text                                  AS id,
       snapshot_date                             AS snapshot_date,
       paymongo_balance::text                    AS paymongo_balance,
       expected_total::text                      AS expected_total,
       discrepancy::text                         AS discrepancy,
       discrepancy_alert_sent                    AS alert_sent
       FROM reconciliation_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 30`,
  );

  const recent: ReconciliationOverview['recent'] = r.rows.map((row) => ({
    id: row.id,
    snapshotDate: row.snapshot_date.toISOString().slice(0, 10),
    paymongoBalanceCentavos: row.paymongo_balance != null ? Number(row.paymongo_balance) : null,
    expectedTotalCentavos: Number(row.expected_total),
    discrepancyCentavos: Number(row.discrepancy),
    alertSent: row.alert_sent,
  }));

  const openAlertsCount = recent.filter((s) => s.alertSent).length;
  const lastSnapshotDate = recent[0]?.snapshotDate ?? null;
  const daysSinceLastSnapshot =
    lastSnapshotDate != null
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(`${lastSnapshotDate}T00:00:00Z`).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  return {
    recent,
    openAlertsCount,
    lastSnapshotDate,
    daysSinceLastSnapshot,
  };
}

// ─────────────────────────────────────────────────────────────────
// BIR Reports tab
// ─────────────────────────────────────────────────────────────────

interface VatMonthlyRow {
  period_year: number;
  period_month: number;
  output_vat: string;
  vat_payable: string;
  finalized_at: Date | null;
  pdf_url: string | null;
}

interface BatchRow {
  tax_year: number;
  tax_quarter: number;
  batch_count: string;
  total_withheld: string;
}

/**
 * Tab 7 — BIR reports overview for one tax year (defaults to the current
 * year). Returns: monthly VAT 2550M-equivalent rows, a per-quarter rollup
 * of 2307 batches issued for that year, and an annual summary derived from
 * the same monthly rows so we don't issue an extra query. Both Phase-08
 * tables are guarded.
 */
export async function getBirReportsOverview(year?: number): Promise<BirReportsOverview> {
  const targetYear =
    year && Number.isInteger(year) && year >= 2000 && year <= 2999
      ? year
      : new Date().getUTCFullYear();

  const [vatExists, batchExists] = await Promise.all([
    tableExists('vat_monthly_reports'),
    tableExists('bir_2307_batches'),
  ]);

  const empty: BirReportsOverview = {
    vatMonthly: [],
    q2307Batches: [],
    annualSummary: {
      year: targetYear,
      totalOutputVatCentavos: 0,
      totalVatPayableCentavos: 0,
      monthsFinalized: 0,
    },
  };

  if (!vatExists && !batchExists) {
    return empty;
  }

  const [vatRes, batchRes] = await Promise.all([
    vatExists
      ? db.query<VatMonthlyRow>(
          `SELECT
             period_year                                AS period_year,
             period_month                               AS period_month,
             output_vat::text                           AS output_vat,
             vat_payable::text                          AS vat_payable,
             finalized_at                               AS finalized_at,
             pdf_url                                    AS pdf_url
             FROM vat_monthly_reports
            WHERE period_year = $1
            ORDER BY period_month ASC`,
          [targetYear],
        )
      : Promise.resolve({ rows: [] as VatMonthlyRow[] }),
    batchExists
      ? db.query<BatchRow>(
          `SELECT
             tax_year                                   AS tax_year,
             tax_quarter                                AS tax_quarter,
             COUNT(*)::text                             AS batch_count,
             COALESCE(SUM(withheld_amount), 0)::text    AS total_withheld
             FROM bir_2307_batches
            WHERE tax_year = $1
            GROUP BY tax_year, tax_quarter
            ORDER BY tax_quarter ASC`,
          [targetYear],
        )
      : Promise.resolve({ rows: [] as BatchRow[] }),
  ]);

  const vatMonthly: BirReportsOverview['vatMonthly'] = vatRes.rows.map((row) => ({
    year: row.period_year,
    month: row.period_month,
    outputVatCentavos: Number(row.output_vat),
    vatPayableCentavos: Number(row.vat_payable),
    finalized: row.finalized_at != null,
    pdfUrl: row.pdf_url,
  }));

  const q2307Batches: BirReportsOverview['q2307Batches'] = batchRes.rows.map((row) => ({
    year: row.tax_year,
    quarter: row.tax_quarter,
    batchCount: Number(row.batch_count),
    totalWithheldCentavos: Number(row.total_withheld),
  }));

  const annualSummary: BirReportsOverview['annualSummary'] = {
    year: targetYear,
    totalOutputVatCentavos: vatMonthly.reduce((acc, m) => acc + m.outputVatCentavos, 0),
    totalVatPayableCentavos: vatMonthly.reduce((acc, m) => acc + m.vatPayableCentavos, 0),
    monthsFinalized: vatMonthly.filter((m) => m.finalized).length,
  };

  return { vatMonthly, q2307Batches, annualSummary };
}

// ─────────────────────────────────────────────────────────────────
// Receipts tab
// ─────────────────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  or_number: string;
  booking_id: string;
  customer_id: string;
  customer_name: string;
  provider_id: string | null;
  provider_name: string | null;
  issued_at: Date;
  gross_amount: string;
  vat_amount: string;
  is_cancellation: boolean;
  pdf_url: string | null;
}

interface ReceiptCountRow {
  total: string;
}

/**
 * Tab 8 — receipts search. Joins `official_receipts` with the customer's
 * `users` row and the provider's `providers` row so the admin gets fully
 * resolved names. All filters are optional; matching is case-insensitive
 * via `ILIKE`. Returns `{rows, total}` so the admin UI can paginate.
 */
export async function searchReceipts(query: {
  orNumber?: string;
  customerName?: string;
  providerName?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: ReceiptSearchResult[]; total: number }> {
  if (query.from || query.to) {
    if (!query.from || !query.to) {
      throw createAppError('"from" and "to" must be provided together.', 400);
    }
    assertDateRange(query.from, query.to);
  }

  const safeLimit = clampLimit(query.limit);
  const safeOffset = clampOffset(query.offset);

  if (!(await tableExists('official_receipts'))) {
    return { rows: [], total: 0 };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (query.orNumber && query.orNumber.trim() !== '') {
    conditions.push(`o.or_number ILIKE $${idx++}`);
    params.push(`%${query.orNumber.trim()}%`);
  }
  if (query.customerName && query.customerName.trim() !== '') {
    conditions.push(`(cu.first_name || ' ' || cu.last_name) ILIKE $${idx++}`);
    params.push(`%${query.customerName.trim()}%`);
  }
  if (query.providerName && query.providerName.trim() !== '') {
    conditions.push(`p.business_name ILIKE $${idx++}`);
    params.push(`%${query.providerName.trim()}%`);
  }
  if (query.from && query.to) {
    conditions.push(
      `o.issued_at >= ($${idx}::date) AND o.issued_at < ($${idx + 1}::date + INTERVAL '1 day')`,
    );
    params.push(query.from, query.to);
    idx += 2;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataParams = [...params, safeLimit, safeOffset];
  const limitIdx = idx;
  const offsetIdx = idx + 1;

  const [dataRes, countRes] = await Promise.all([
    db.query<ReceiptRow>(
      `SELECT
         o.id::text                                                       AS id,
         o.or_number                                                      AS or_number,
         o.booking_id::text                                               AS booking_id,
         o.customer_id::text                                              AS customer_id,
         TRIM(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')) AS customer_name,
         o.provider_id::text                                              AS provider_id,
         p.business_name                                                  AS provider_name,
         o.issued_at                                                      AS issued_at,
         o.gross_amount::text                                             AS gross_amount,
         o.vat_amount::text                                               AS vat_amount,
         o.is_cancellation                                                AS is_cancellation,
         o.pdf_url                                                        AS pdf_url
         FROM official_receipts o
         JOIN users cu ON cu.id = o.customer_id
         LEFT JOIN providers p ON p.id = o.provider_id
         ${whereClause}
        ORDER BY o.issued_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams,
    ),
    db.query<ReceiptCountRow>(
      `SELECT COUNT(*)::text AS total
         FROM official_receipts o
         JOIN users cu ON cu.id = o.customer_id
         LEFT JOIN providers p ON p.id = o.provider_id
         ${whereClause}`,
      params,
    ),
  ]);

  const rows: ReceiptSearchResult[] = dataRes.rows.map((row) => ({
    id: row.id,
    orNumber: row.or_number,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    customerName: row.customer_name || '(unknown)',
    providerId: row.provider_id,
    providerName: row.provider_name,
    issuedAt: row.issued_at.toISOString(),
    grossCentavos: Number(row.gross_amount),
    vatCentavos: Number(row.vat_amount),
    isCancellation: row.is_cancellation,
    pdfUrl: row.pdf_url,
  }));

  return {
    rows,
    total: Number(countRes.rows[0]?.total ?? 0),
  };
}
