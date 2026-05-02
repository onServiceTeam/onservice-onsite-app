import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as settingsService from './settings.service';

// ────────────────────────────────────────────────────────────────────
// 1. A/B TESTING FRAMEWORK
// ────────────────────────────────────────────────────────────────────

interface AbTestRow {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  variant_a_name: string;
  variant_b_name: string;
  variant_a_config: Record<string, unknown>;
  variant_b_config: Record<string, unknown>;
  target_metric: string;
  traffic_split: string;
  start_date: Date | null;
  end_date: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createAbTest(params: {
  name: string;
  description?: string;
  variantAName?: string;
  variantBName?: string;
  variantAConfig?: Record<string, unknown>;
  variantBConfig?: Record<string, unknown>;
  targetMetric?: string;
  trafficSplit?: number;
  startDate?: string;
  endDate?: string;
  createdBy?: string;
}): Promise<AbTestRow> {
  const result = await db.query<AbTestRow>(
    `INSERT INTO ab_tests
       (name, description, variant_a_name, variant_b_name,
        variant_a_config, variant_b_config, target_metric,
        traffic_split, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      params.name,
      params.description ?? '',
      params.variantAName ?? 'Control',
      params.variantBName ?? 'Variant B',
      JSON.stringify(params.variantAConfig ?? {}),
      JSON.stringify(params.variantBConfig ?? {}),
      params.targetMetric ?? 'conversion_rate',
      params.trafficSplit ?? 0.50,
      params.startDate ?? null,
      params.endDate ?? null,
      params.createdBy ?? null,
    ],
  );

  logger.info('A/B test created', { testId: result.rows[0]!.id, name: params.name });
  return result.rows[0]!;
}

export async function updateAbTestStatus(
  testId: string,
  status: 'draft' | 'active' | 'paused' | 'completed',
): Promise<AbTestRow> {
  const updates: string[] = ['status = $2', 'updated_at = NOW()'];
  const params: unknown[] = [testId, status];

  if (status === 'active') {
    updates.push('start_date = COALESCE(start_date, NOW())');
  } else if (status === 'completed') {
    updates.push('end_date = COALESCE(end_date, NOW())');
  }

  const result = await db.query<AbTestRow>(
    `UPDATE ab_tests SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw createAppError('A/B test not found.', 404);
  }

  return result.rows[0]!;
}

export async function listAbTests(
  status?: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: AbTestRow[]; total: number }> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    db.query<AbTestRow>(
      `SELECT * FROM ab_tests ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ab_tests ${whereClause}`,
      params,
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getAbTestResults(testId: string): Promise<{
  test: AbTestRow;
  variantA: { users: number; conversions: number; conversionRate: number; totalValue: number };
  variantB: { users: number; conversions: number; conversionRate: number; totalValue: number };
  winner: 'A' | 'B' | 'none';
  confidence: number;
}> {
  const testResult = await db.query<AbTestRow>(
    `SELECT * FROM ab_tests WHERE id = $1`,
    [testId],
  );

  if (testResult.rows.length === 0) {
    throw createAppError('A/B test not found.', 404);
  }

  const test = testResult.rows[0]!;

  const statsResult = await db.query<{
    variant: string;
    total_users: string;
    conversions: string;
    total_value: string;
  }>(
    `SELECT variant,
            COUNT(*)::text AS total_users,
            COUNT(CASE WHEN converted THEN 1 END)::text AS conversions,
            COALESCE(SUM(CASE WHEN converted THEN conversion_value ELSE 0 END), 0)::text AS total_value
     FROM ab_test_assignments
     WHERE test_id = $1
     GROUP BY variant`,
    [testId],
  );

  const variantA = { users: 0, conversions: 0, conversionRate: 0, totalValue: 0 };
  const variantB = { users: 0, conversions: 0, conversionRate: 0, totalValue: 0 };

  for (const row of statsResult.rows) {
    const data = {
      users: Number(row.total_users),
      conversions: Number(row.conversions),
      conversionRate: 0,
      totalValue: Number(row.total_value),
    };
    data.conversionRate = data.users > 0 ? Math.round((data.conversions / data.users) * 10000) / 100 : 0;

    if (row.variant === 'A') Object.assign(variantA, data);
    else Object.assign(variantB, data);
  }

  let winner: 'A' | 'B' | 'none' = 'none';
  let confidence = 0;

  if (variantA.users >= 30 && variantB.users >= 30) {
    const pA = variantA.conversions / variantA.users;
    const pB = variantB.conversions / variantB.users;
    const pPool = (variantA.conversions + variantB.conversions) / (variantA.users + variantB.users);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / variantA.users + 1 / variantB.users));

    if (se > 0) {
      const zScore = Math.abs(pA - pB) / se;
      if (zScore >= 1.96) confidence = 95;
      else if (zScore >= 1.645) confidence = 90;
      else confidence = Math.round(Math.min(89, zScore / 1.96 * 95));

      if (confidence >= 90) {
        winner = pA > pB ? 'A' : 'B';
      }
    }
  }

  return { test, variantA, variantB, winner, confidence };
}

// ────────────────────────────────────────────────────────────────────
// 2. COHORT ANALYSIS
// ────────────────────────────────────────────────────────────────────

export async function getCohortAnalysis(
  months = 6,
  metric: 'retention' | 'revenue' = 'retention',
): Promise<Array<{
  cohort: string;
  cohortSize: number;
  periods: Array<{ period: number; value: number; percentage: number }>;
}>> {
  const safeMonths = Math.min(12, Math.max(1, months));

  if (metric === 'retention') {
    const result = await db.query<{
      cohort: string;
      cohort_size: string;
      period_offset: string;
      active_users: string;
    }>(
      `WITH cohort_users AS (
         SELECT id, DATE_TRUNC('month', created_at)::date AS cohort_month
         FROM users WHERE role = 'customer'
           AND created_at >= NOW() - INTERVAL '1 month' * $1
       ),
       cohort_sizes AS (
         SELECT cohort_month, COUNT(*)::text AS cohort_size
         FROM cohort_users
         GROUP BY cohort_month
       ),
       activity AS (
         SELECT
           cu.cohort_month,
           EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', b.created_at), cu.cohort_month))::int AS period_offset,
           COUNT(DISTINCT cu.id) AS active_users
         FROM cohort_users cu
         INNER JOIN bookings b ON b.customer_id = cu.id
           AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
           AND DATE_TRUNC('month', b.created_at) >= cu.cohort_month
         GROUP BY cu.cohort_month, EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', b.created_at), cu.cohort_month))
       )
       SELECT
         cs.cohort_month::text AS cohort,
         cs.cohort_size,
         a.period_offset::text AS period_offset,
         a.active_users::text AS active_users
       FROM cohort_sizes cs
       LEFT JOIN activity a ON a.cohort_month = cs.cohort_month
       ORDER BY cs.cohort_month ASC, a.period_offset ASC`,
      [safeMonths],
    );

    const cohortMap = new Map<string, { size: number; periods: Map<number, number> }>();

    for (const row of result.rows) {
      if (!cohortMap.has(row.cohort)) {
        cohortMap.set(row.cohort, { size: Number(row.cohort_size), periods: new Map() });
      }
      if (row.period_offset !== null) {
        const offset = Number(row.period_offset);
        if (!isNaN(offset) && offset >= 0) {
          cohortMap.get(row.cohort)!.periods.set(offset, Number(row.active_users));
        }
      }
    }

    return Array.from(cohortMap.entries()).map(([cohort, data]) => ({
      cohort,
      cohortSize: data.size,
      periods: Array.from(data.periods.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([period, value]) => ({ // SAFE-N+1: in-memory cohort/period nested mapping over already-aggregated Map; no DB calls.
          period,
          value,
          percentage: data.size > 0 ? Math.round((value / data.size) * 10000) / 100 : 0,
        })),
    }));
  }

  const result = await db.query<{
    cohort: string;
    cohort_size: string;
    period_offset: string;
    total_revenue: string;
  }>(
    `WITH cohort_users AS (
       SELECT id, DATE_TRUNC('month', created_at)::date AS cohort_month
       FROM users WHERE role = 'customer'
         AND created_at >= NOW() - INTERVAL '1 month' * $1
     ),
     cohort_sizes AS (
       SELECT cohort_month, COUNT(*)::text AS cohort_size
       FROM cohort_users
       GROUP BY cohort_month
     ),
     revenue AS (
       SELECT
         cu.cohort_month,
         EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', b.created_at), cu.cohort_month))::int AS period_offset,
         COALESCE(SUM(b.total_amount), 0) AS total_revenue
       FROM cohort_users cu
       INNER JOIN bookings b ON b.customer_id = cu.id
         AND b.status IN ('confirmed', 'payout_ready', 'paid_out')
         AND DATE_TRUNC('month', b.created_at) >= cu.cohort_month
       GROUP BY cu.cohort_month, EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', b.created_at), cu.cohort_month))
     )
     SELECT
       cs.cohort_month::text AS cohort,
       cs.cohort_size,
       r.period_offset::text AS period_offset,
       r.total_revenue::text AS total_revenue
     FROM cohort_sizes cs
     LEFT JOIN revenue r ON r.cohort_month = cs.cohort_month
     ORDER BY cs.cohort_month ASC, r.period_offset ASC`,
    [safeMonths],
  );

  const cohortMap = new Map<string, { size: number; periods: Map<number, number> }>();

  for (const row of result.rows) {
    if (!cohortMap.has(row.cohort)) {
      cohortMap.set(row.cohort, { size: Number(row.cohort_size), periods: new Map() });
    }
    if (row.period_offset !== null) {
      const offset = Number(row.period_offset);
      if (!isNaN(offset) && offset >= 0) {
        cohortMap.get(row.cohort)!.periods.set(offset, Number(row.total_revenue));
      }
    }
  }

  return Array.from(cohortMap.entries()).map(([cohort, data]) => ({
    cohort,
    cohortSize: data.size,
    periods: Array.from(data.periods.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([period, value]) => ({
        period,
        value,
        percentage: data.size > 0 ? Math.round((value / data.size) * 100) / 100 : 0,
      })),
  }));
}

// ────────────────────────────────────────────────────────────────────
// 3. CUSTOMER CHURN PREDICTION
// ────────────────────────────────────────────────────────────────────

interface ChurnRiskCustomer {
  userId: string;
  name: string;
  phone: string;
  lastBookingDate: string | null;
  daysSinceLastBooking: number;
  totalBookings: number;
  totalSpent: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export async function getChurnPrediction(
  page = 1,
  pageSize = 20,
  riskLevel?: string,
): Promise<{ items: ChurnRiskCustomer[]; total: number }> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;

  // MED-N04 fix: pre-fix loaded ALL customer rows into Node memory,
  // computed risk score per row in JS, filtered by riskLevel, then
  // sliced to a page. For 100k+ customers, every page request
  // pulled them all and dropped 99.98%. Now: risk-score components
  // computed in SQL via CASE WHEN, riskLevel buckets derived as a
  // computed column, ORDER BY + LIMIT/OFFSET in the database.
  // Total count comes from a COUNT(*) over the same scoring CTE
  // (with the optional risk-level filter applied), so pagination
  // metadata stays accurate.
  //
  // The score-computation logic mirrors the previous JS code
  // exactly:
  //   days >= 90 → +40,  >= 60 → +25, >= 30 → +10
  //   bookings <= 1 → +30, <= 3 → +15
  //   spent === 0 → +30, < 100000 → +10
  //   level: >= 80 critical, >= 60 high, >= 35 medium, else low
  //   score capped at 100 via LEAST(100, ...).
  const allowedLevels = new Set(['low', 'medium', 'high', 'critical']);
  const safeLevel = riskLevel && allowedLevels.has(riskLevel) ? riskLevel : null;

  const scoringCte = `
    WITH scored AS (
      SELECT
        u.id AS user_id,
        TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
        u.phone,
        MAX(b.created_at) AS last_booking_date,
        COALESCE(EXTRACT(DAY FROM NOW() - MAX(b.created_at))::int, 999) AS days_since_last,
        COUNT(b.id) AS total_bookings,
        COALESCE(SUM(b.total_amount), 0)::bigint AS total_spent,
        LEAST(100,
          (CASE WHEN COALESCE(EXTRACT(DAY FROM NOW() - MAX(b.created_at))::int, 999) >= 90 THEN 40
                WHEN COALESCE(EXTRACT(DAY FROM NOW() - MAX(b.created_at))::int, 999) >= 60 THEN 25
                WHEN COALESCE(EXTRACT(DAY FROM NOW() - MAX(b.created_at))::int, 999) >= 30 THEN 10
                ELSE 0 END)
          + (CASE WHEN COUNT(b.id) <= 1 THEN 30
                  WHEN COUNT(b.id) <= 3 THEN 15
                  ELSE 0 END)
          + (CASE WHEN COALESCE(SUM(b.total_amount), 0) = 0 THEN 30
                  WHEN COALESCE(SUM(b.total_amount), 0) < 100000 THEN 10
                  ELSE 0 END)
        ) AS risk_score
      FROM users u
      LEFT JOIN bookings b ON b.customer_id = u.id
        AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
      WHERE u.role = 'customer'
      GROUP BY u.id, u.first_name, u.last_name, u.phone
    ),
    leveled AS (
      SELECT *,
        CASE WHEN risk_score >= 80 THEN 'critical'
             WHEN risk_score >= 60 THEN 'high'
             WHEN risk_score >= 35 THEN 'medium'
             ELSE 'low' END AS risk_level
      FROM scored
    )
  `;

  const filterClause = safeLevel ? 'WHERE risk_level = $1' : '';
  const dataParams = safeLevel
    ? [safeLevel, safePageSize, offset]
    : [safePageSize, offset];
  const limitParam = safeLevel ? '$2' : '$1';
  const offsetParam = safeLevel ? '$3' : '$2';

  const [dataResult, countResult] = await Promise.all([
    db.query<{
      user_id: string;
      name: string;
      phone: string;
      last_booking_date: Date | null;
      days_since_last: number;
      total_bookings: string;
      total_spent: string;
      risk_score: number;
      risk_level: 'low' | 'medium' | 'high' | 'critical';
    }>(
      `${scoringCte}
       SELECT * FROM leveled
       ${filterClause}
       ORDER BY risk_score DESC, days_since_last DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      dataParams,
    ),
    db.query<{ count: string }>(
      `${scoringCte}
       SELECT COUNT(*)::text AS count FROM leveled
       ${filterClause}`,
      safeLevel ? [safeLevel] : [],
    ),
  ]);

  const items: ChurnRiskCustomer[] = dataResult.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    lastBookingDate: row.last_booking_date?.toISOString() ?? null,
    daysSinceLastBooking: Number(row.days_since_last),
    totalBookings: Number(row.total_bookings),
    totalSpent: Number(row.total_spent),
    riskScore: Number(row.risk_score),
    riskLevel: row.risk_level,
  }));

  return { items, total: Number(countResult.rows[0]?.count ?? 0) };
}

// ────────────────────────────────────────────────────────────────────
// 4. AUTOMATED PROVIDER QUALITY SCORING
// ────────────────────────────────────────────────────────────────────

interface QualityScoreRow {
  id: string;
  provider_id: string;
  overall_score: string;
  rating_score: string;
  completion_score: string;
  timeliness_score: string;
  cancellation_score: string;
  response_score: string;
  total_jobs_scored: number;
  period_start: Date;
  period_end: Date;
  computed_at: Date;
}

export async function computeProviderQualityScores(
  periodDays = 90,
): Promise<number> {
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodDays);
  const periodStartStr = periodStart.toISOString().split('T')[0]!;
  const periodEndStr = new Date().toISOString().split('T')[0]!;

  // MED-N05 fix: also pull average response-time-to-quote from
  // booking_quotes for the responseScore component (was hardcoded
  // 75). LEFT JOIN so providers with zero quotes in the period
  // still get a row (avg_response_minutes = NULL → fallback to 75).
  const providers = await db.query<{
    provider_id: string;
    avg_rating: string;
    total_jobs: string;
    completed_jobs: string;
    cancelled_by_provider: string;
    on_time_jobs: string;
    avg_response_minutes: string | null;
    quote_count: string;
  }>(
    `WITH quote_response AS (
       SELECT
         bq.provider_id,
         AVG(EXTRACT(EPOCH FROM (bq.created_at - b.created_at)) / 60.0) AS avg_minutes,
         COUNT(*) AS qcount
         FROM booking_quotes bq
         JOIN bookings b ON b.id = bq.booking_id
        WHERE bq.created_at >= $1::date
        GROUP BY bq.provider_id
     )
     SELECT
       p.id AS provider_id,
       COALESCE(p.rating, 0)::text AS avg_rating,
       COUNT(b.id)::text AS total_jobs,
       COUNT(b.id) FILTER (WHERE b.status IN ('confirmed', 'payout_ready', 'paid_out'))::text AS completed_jobs,
       COUNT(b.id) FILTER (WHERE b.status = 'cancelled_by_provider')::text AS cancelled_by_provider,
       COUNT(b.id) FILTER (
         WHERE b.status IN ('confirmed', 'payout_ready', 'paid_out')
           AND b.completed_at IS NOT NULL
           AND b.completed_at <= b.scheduled_at + INTERVAL '2 hours'
       )::text AS on_time_jobs,
       qr.avg_minutes::text AS avg_response_minutes,
       COALESCE(qr.qcount, 0)::text AS quote_count
     FROM providers p
     LEFT JOIN bookings b ON b.provider_id = p.id
       AND b.created_at >= $1::date
     LEFT JOIN quote_response qr ON qr.provider_id = p.id
     WHERE p.status = 'approved'
     GROUP BY p.id, p.rating, qr.avg_minutes, qr.qcount`,
    [periodStartStr],
  );

  let computed = 0;

  for (const prov of providers.rows) {
    const totalJobs = Number(prov.total_jobs);
    const completedJobs = Number(prov.completed_jobs);
    const cancelledByProvider = Number(prov.cancelled_by_provider);
    const onTimeJobs = Number(prov.on_time_jobs);
    const avgRating = Number(prov.avg_rating);

    const ratingScore = Math.min(100, (avgRating / 5) * 100);

    const completionScore = totalJobs > 0
      ? Math.min(100, (completedJobs / totalJobs) * 100)
      : 50;

    const timelinessScore = completedJobs > 0
      ? Math.min(100, (onTimeJobs / completedJobs) * 100)
      : 50;

    const cancellationScore = totalJobs > 0
      ? Math.max(0, 100 - (cancelledByProvider / totalJobs) * 200)
      : 100;

    // MED-N05 fix: real responseScore based on average minutes
    // between job-request creation and provider's quote submission.
    // Pre-fix this was a hardcoded 75. Sliding tier:
    //   < 30 min  → 100  (instant)
    //   30-60 min → 90
    //   1-2 h     → 80
    //   2-6 h     → 70
    //   6-24 h    → 50
    //   > 24 h    → 25
    //   0 quotes  → 75   (no signal yet — same as pre-fix default)
    const quoteCount = Number(prov.quote_count);
    const avgRespMins = prov.avg_response_minutes !== null
      ? Number(prov.avg_response_minutes)
      : null;
    let responseScore: number;
    if (quoteCount === 0 || avgRespMins === null) {
      responseScore = 75;
    } else if (avgRespMins < 30) {
      responseScore = 100;
    } else if (avgRespMins < 60) {
      responseScore = 90;
    } else if (avgRespMins < 120) {
      responseScore = 80;
    } else if (avgRespMins < 360) {
      responseScore = 70;
    } else if (avgRespMins < 1440) {
      responseScore = 50;
    } else {
      responseScore = 25;
    }

    const w = platformConfig.qualityScoreWeights;
    const overall = Math.round(
      ratingScore * w.rating +
      completionScore * w.completion +
      timelinessScore * w.timeliness +
      cancellationScore * w.cancellation +
      responseScore * w.response,
    );

    await db.query(
      `INSERT INTO provider_quality_scores
         (provider_id, overall_score, rating_score, completion_score,
          timeliness_score, cancellation_score, response_score,
          total_jobs_scored, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (provider_id, period_start, period_end) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         rating_score = EXCLUDED.rating_score,
         completion_score = EXCLUDED.completion_score,
         timeliness_score = EXCLUDED.timeliness_score,
         cancellation_score = EXCLUDED.cancellation_score,
         response_score = EXCLUDED.response_score,
         total_jobs_scored = EXCLUDED.total_jobs_scored,
         computed_at = NOW()`,
      [
        prov.provider_id,
        overall,
        Math.round(ratingScore * 100) / 100,
        Math.round(completionScore * 100) / 100,
        Math.round(timelinessScore * 100) / 100,
        Math.round(cancellationScore * 100) / 100,
        Math.round(responseScore * 100) / 100,
        totalJobs,
        periodStartStr,
        periodEndStr,
      ],
    );

    computed++;
  }

  logger.info('Provider quality scores computed', { count: computed, periodDays });
  return computed;
}

export async function getProviderQualityScores(
  page = 1,
  pageSize = 20,
  sortBy: 'overall' | 'rating' | 'completion' | 'timeliness' = 'overall',
): Promise<{
  items: Array<{
    providerId: string;
    providerName: string;
    businessName: string;
    tier: string;
    overallScore: number;
    ratingScore: number;
    completionScore: number;
    timelinessScore: number;
    cancellationScore: number;
    responseScore: number;
    totalJobsScored: number;
    computedAt: string;
  }>;
  total: number;
}> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;

  const sortColumn = {
    overall: 'pqs.overall_score',
    rating: 'pqs.rating_score',
    completion: 'pqs.completion_score',
    timeliness: 'pqs.timeliness_score',
  }[sortBy] ?? 'pqs.overall_score';

  const [dataResult, countResult] = await Promise.all([
    db.query<QualityScoreRow & { provider_name: string; business_name: string; tier: string }>(
      `SELECT pqs.*,
              TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS provider_name,
              p.business_name, p.tier
       FROM provider_quality_scores pqs
       INNER JOIN providers p ON pqs.provider_id = p.id
       INNER JOIN users u ON p.user_id = u.id
       WHERE (pqs.provider_id, pqs.computed_at) IN (
         SELECT provider_id, MAX(computed_at) FROM provider_quality_scores GROUP BY provider_id
       )
       ORDER BY ${sortColumn} DESC
       LIMIT $1 OFFSET $2`,
      [safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(DISTINCT provider_id)::text AS count FROM provider_quality_scores`,
    ),
  ]);

  return {
    items: dataResult.rows.map((r) => ({
      providerId: r.provider_id,
      providerName: r.provider_name,
      businessName: r.business_name,
      tier: r.tier,
      overallScore: Number(r.overall_score),
      ratingScore: Number(r.rating_score),
      completionScore: Number(r.completion_score),
      timelinessScore: Number(r.timeliness_score),
      cancellationScore: Number(r.cancellation_score),
      responseScore: Number(r.response_score),
      totalJobsScored: r.total_jobs_scored,
      computedAt: r.computed_at.toISOString(),
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ────────────────────────────────────────────────────────────────────
// 5. AUTOMATED COMMISSION RATE OPTIMIZATION
// ────────────────────────────────────────────────────────────────────

export async function getCommissionOptimizationSuggestions(): Promise<Array<{
  tier: string;
  currentRate: number;
  suggestedRate: number;
  providerCount: number;
  avgQualityScore: number;
  avgRevenue: number;
  rationale: string;
}>> {
  const tiers = Object.keys(platformConfig.commissionRates);
  if (tiers.length === 0) {
    return [];
  }

  // Phase 13 Dispatch E — was 4 sequential queries (one per tier).
  // Now: ONE GROUP BY query that returns metrics for every tier in a
  // single round-trip. Tiers with zero approved providers fall back to
  // sentinel defaults to keep the response shape unchanged.
  const aggregated = await db.query<{
    tier: string;
    provider_count: string;
    avg_quality: string;
    avg_revenue: string;
    avg_bookings: string;
  }>(
    `SELECT
       p.tier,
       COUNT(DISTINCT p.id)::text AS provider_count,
       COALESCE(AVG(pqs.overall_score), 50)::text AS avg_quality,
       COALESCE(AVG(bm.total_revenue), 0)::text AS avg_revenue,
       COALESCE(AVG(bm.booking_count), 0)::text AS avg_bookings
     FROM providers p
     LEFT JOIN (
       SELECT provider_id, MAX(computed_at) AS latest
       FROM provider_quality_scores GROUP BY provider_id
     ) pqs_latest ON pqs_latest.provider_id = p.id
     LEFT JOIN provider_quality_scores pqs
       ON pqs.provider_id = p.id AND pqs.computed_at = pqs_latest.latest
     LEFT JOIN (
       SELECT provider_id,
              SUM(total_amount)::bigint AS total_revenue,
              COUNT(*)::bigint AS booking_count
       FROM bookings
       WHERE status IN ('confirmed', 'payout_ready', 'paid_out')
         AND confirmed_at >= NOW() - INTERVAL '90 days'
       GROUP BY provider_id
     ) bm ON bm.provider_id = p.id
     WHERE p.tier = ANY($1::text[]) AND p.status = 'approved'
     GROUP BY p.tier`,
    [tiers],
  );

  const byTier = new Map<string, {
    provider_count: string;
    avg_quality: string;
    avg_revenue: string;
    avg_bookings: string;
  }>();
  for (const row of aggregated.rows) {
    byTier.set(row.tier, row);
  }

  const suggestions: Array<{
    tier: string;
    currentRate: number;
    suggestedRate: number;
    providerCount: number;
    avgQualityScore: number;
    avgRevenue: number;
    rationale: string;
  }> = [];

  for (const tier of tiers) {
    // MED-N06 fix: read live commission rate from platform_settings
    // (admin-editable). Pre-fix this used platformConfig.commissionRates[tier]
    // which is the in-process default constant — if admin tuned the
    // rate via /admin/settings, the suggestion compared to the wrong
    // starting point. settingsService.getCommissionRate falls back to
    // platformConfig if the setting isn't present, so behavior is
    // backward-compatible with deployments that never wrote to settings.
    let currentRate: number;
    try {
      currentRate = await settingsService.getCommissionRate(tier);
    } catch (err) {
      logger.warn('Commission rate lookup failed; using platformConfig fallback', {
        tier,
        error: err instanceof Error ? err.message : String(err),
      });
      currentRate = platformConfig.commissionRates[tier]!;
    }
    const row = byTier.get(tier) ?? {
      provider_count: '0',
      avg_quality: '50',
      avg_revenue: '0',
      avg_bookings: '0',
    };

    const providerCount = Number(row.provider_count);
    const avgQuality = Number(row.avg_quality);
    const avgRevenue = Number(row.avg_revenue);

    let suggestedRate = currentRate;
    let rationale = 'Current rate is appropriate.';

    if (avgQuality >= 85 && avgRevenue > 500000) {
      suggestedRate = Math.max(currentRate - 0.02, 0.08);
      rationale = `High quality (${avgQuality.toFixed(1)}) and strong revenue suggest a rate decrease to retain top providers.`;
    } else if (avgQuality < 60) {
      suggestedRate = Math.min(currentRate + 0.02, 0.25);
      rationale = `Below-average quality (${avgQuality.toFixed(1)}) suggests increasing the rate to fund quality improvement programs.`;
    } else if (providerCount < 5) {
      suggestedRate = Math.max(currentRate - 0.01, 0.08);
      rationale = `Low provider count (${providerCount}) — consider reducing rate to attract more providers to this tier.`;
    }

    suggestedRate = Math.round(suggestedRate * 100) / 100;

    suggestions.push({
      tier,
      currentRate,
      suggestedRate,
      providerCount,
      avgQualityScore: Math.round(avgQuality * 100) / 100,
      avgRevenue: Math.round(avgRevenue),
      rationale,
    });
  }

  return suggestions;
}

// ────────────────────────────────────────────────────────────────────
// FORMATTERS
// ────────────────────────────────────────────────────────────────────

export function formatAbTest(t: AbTestRow): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    variantAName: t.variant_a_name,
    variantBName: t.variant_b_name,
    variantAConfig: t.variant_a_config,
    variantBConfig: t.variant_b_config,
    targetMetric: t.target_metric,
    trafficSplit: Number(t.traffic_split),
    startDate: t.start_date?.toISOString() ?? null,
    endDate: t.end_date?.toISOString() ?? null,
    createdBy: t.created_by,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// ────────────────────────────────────────────────────────────────────
// PHASE 04 — ADMIN DASHBOARD (read-only analytics; no money mutations)
// ────────────────────────────────────────────────────────────────────

export type DashboardRange = 'today' | '7d' | '30d' | '90d' | 'ytd';
export type AlertSeverity = 'info' | 'warning' | 'danger';

export interface DashboardKpis {
  revenue: number;
  revenueTrendPct: number;
  activeBookings: number;
  pendingDisputes: number;
  newSignups: number;
  pendingApprovals: number;
  todayBookings: number;
  escalatedDisputes: number;
  staleDisputes: number;
  escrowBalance: number;
  platformRevenue: number;
  guaranteeFund: number;
  guaranteeFundRunwayMonths: number;
}

export interface RevenueTrendPoint {
  date: string;
  gmv: number;
  revenue: number;
}

export interface BookingVolumePoint {
  category: string;
  count: number;
}

export interface AcquisitionFunnel {
  registered: number;
  firstBooking: number;
  repeatBooking: number;
}

export interface DashboardAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action_url: string | null;
  created_at: string;
}

export interface CityPerformance {
  id: string;
  name: string;
  status: string;
  activeProviders: number;
  todayBookings: number;
}

const VALID_RANGES: ReadonlyArray<DashboardRange> = ['today', '7d', '30d', '90d', 'ytd'];
export function isDashboardRange(v: unknown): v is DashboardRange {
  return typeof v === 'string' && (VALID_RANGES as ReadonlyArray<string>).includes(v);
}

function rangeStartSql(range: DashboardRange): string {
  switch (range) {
    case 'today': return "DATE_TRUNC('day', NOW())";
    case 'ytd':   return "DATE_TRUNC('year', NOW())";
    case '7d':    return "NOW() - INTERVAL '7 days'";
    case '30d':   return "NOW() - INTERVAL '30 days'";
    case '90d':   return "NOW() - INTERVAL '90 days'";
  }
}

function previousRangeSql(range: DashboardRange): { start: string; end: string } {
  switch (range) {
    case 'today':
      return { start: "DATE_TRUNC('day', NOW() - INTERVAL '1 day')", end: "DATE_TRUNC('day', NOW())" };
    case '7d':
      return { start: "NOW() - INTERVAL '14 days'", end: "NOW() - INTERVAL '7 days'" };
    case '30d':
      return { start: "NOW() - INTERVAL '60 days'", end: "NOW() - INTERVAL '30 days'" };
    case '90d':
      return { start: "NOW() - INTERVAL '180 days'", end: "NOW() - INTERVAL '90 days'" };
    case 'ytd':
      return { start: "DATE_TRUNC('year', NOW() - INTERVAL '1 year')", end: "(NOW() - INTERVAL '1 year')" };
  }
}

function clampDays(days: number, min: number, max: number): number {
  if (!Number.isFinite(days)) return min;
  const n = Math.floor(days);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getDashboardKpis(range: DashboardRange): Promise<DashboardKpis> {
  const startSql = rangeStartSql(range);
  const prev = previousRangeSql(range);

  const [
    revRow,
    countsRow,
    walletsRow,
    burnRow,
  ] = await Promise.all([
    db.query<{ current: string; previous: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN created_at >= ${startSql} THEN amount ELSE 0 END), 0)::text AS current,
         COALESCE(SUM(CASE WHEN created_at >= ${prev.start} AND created_at < ${prev.end} THEN amount ELSE 0 END), 0)::text AS previous
       FROM wallet_transactions
       WHERE type IN ('commission', 'service_fee')
         AND created_at >= ${prev.start}`,
    ),
    db.query<{
      active_bookings: string;
      pending_disputes: string;
      new_signups: string;
      pending_approvals: string;
      today_bookings: string;
      escalated_disputes: string;
      stale_disputes: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM bookings
            WHERE status NOT IN ('cancelled_by_customer','cancelled_by_provider','cancelled_by_admin','paid_out','confirmed','resolved'))::text AS active_bookings,
         (SELECT COUNT(*) FROM disputes WHERE status IN ('open','under_review','escalated'))::text AS pending_disputes,
         (SELECT COUNT(*) FROM users WHERE created_at >= ${startSql})::text AS new_signups,
         (SELECT COUNT(*) FROM providers WHERE status = 'pending')::text AS pending_approvals,
         (SELECT COUNT(*) FROM bookings WHERE created_at >= DATE_TRUNC('day', NOW()))::text AS today_bookings,
         (SELECT COUNT(*) FROM disputes WHERE status = 'escalated')::text AS escalated_disputes,
         (SELECT COUNT(*) FROM disputes WHERE status = 'open' AND created_at < NOW() - INTERVAL '48 hours')::text AS stale_disputes`,
    ),
    db.query<{
      escrow: string;
      revenue: string;
      guarantee: string;
    }>(
      `SELECT
         COALESCE((SELECT pending_balance FROM wallets WHERE type = 'platform_escrow' AND user_id IS NULL), 0)::text AS escrow,
         COALESCE((SELECT available_balance FROM wallets WHERE type = 'platform_revenue' AND user_id IS NULL), 0)::text AS revenue,
         COALESCE((SELECT available_balance FROM wallets WHERE type = 'guarantee_fund' AND user_id IS NULL), 0)::text AS guarantee`,
    ),
    db.query<{ burn: string }>(
      `SELECT COALESCE(ABS(SUM(amount)), 0)::text AS burn
         FROM wallet_transactions wt
         JOIN wallets w ON w.id = wt.wallet_id
        WHERE w.type = 'guarantee_fund'
          AND wt.amount < 0
          AND wt.created_at >= NOW() - INTERVAL '30 days'`,
    ),
  ]);

  const current = Number(revRow.rows[0]?.current ?? 0);
  const previous = Number(revRow.rows[0]?.previous ?? 0);
  const c = countsRow.rows[0]!;
  const w = walletsRow.rows[0]!;
  const guarantee = Number(w.guarantee);
  const monthlyBurn = Number(burnRow.rows[0]?.burn ?? 0);
  const runwayMonths = monthlyBurn > 0
    ? Math.round((guarantee / monthlyBurn) * 10) / 10
    : 99;

  return {
    revenue: current,
    revenueTrendPct: pctChange(current, previous),
    activeBookings: Number(c.active_bookings),
    pendingDisputes: Number(c.pending_disputes),
    newSignups: Number(c.new_signups),
    pendingApprovals: Number(c.pending_approvals),
    todayBookings: Number(c.today_bookings),
    escalatedDisputes: Number(c.escalated_disputes),
    staleDisputes: Number(c.stale_disputes),
    escrowBalance: Number(w.escrow),
    platformRevenue: Number(w.revenue),
    guaranteeFund: guarantee,
    guaranteeFundRunwayMonths: runwayMonths,
  };
}

export async function getRevenueTrend(days: number): Promise<RevenueTrendPoint[]> {
  const n = clampDays(days, 1, 365);
  const rows = await db.query<{ date: string; gmv: string; revenue: string }>(
    `WITH series AS (
       SELECT generate_series(
         DATE_TRUNC('day', NOW()) - (($1::int - 1) || ' days')::interval,
         DATE_TRUNC('day', NOW()),
         INTERVAL '1 day'
       )::date AS day
     ),
     gmv AS (
       SELECT DATE_TRUNC('day', created_at)::date AS day,
              COALESCE(SUM(amount), 0)::bigint AS amount
         FROM wallet_transactions
        WHERE type = 'payment'
          AND created_at >= NOW() - (($1::int) || ' days')::interval
        GROUP BY 1
     ),
     rev AS (
       SELECT DATE_TRUNC('day', created_at)::date AS day,
              COALESCE(SUM(amount), 0)::bigint AS amount
         FROM wallet_transactions
        WHERE type IN ('commission', 'service_fee')
          AND created_at >= NOW() - (($1::int) || ' days')::interval
        GROUP BY 1
     )
     SELECT to_char(s.day, 'YYYY-MM-DD') AS date,
            COALESCE(gmv.amount, 0)::text AS gmv,
            COALESCE(rev.amount, 0)::text AS revenue
       FROM series s
       LEFT JOIN gmv ON gmv.day = s.day
       LEFT JOIN rev ON rev.day = s.day
      ORDER BY s.day ASC`,
    [n],
  );

  return rows.rows.map((r) => ({ // SAFE-N+1: in-memory row-to-DTO projection of LIMIT-bounded daily series; no DB calls inside map.
    date: r.date,
    gmv: Number(r.gmv),
    revenue: Number(r.revenue),
  }));
}

export async function getBookingVolumeByCategory(days: number): Promise<BookingVolumePoint[]> {
  const n = clampDays(days, 1, 365);
  const rows = await db.query<{ category: string; count: string }>(
    `SELECT COALESCE(c.name, 'Uncategorized') AS category,
            COUNT(b.id)::text AS count
       FROM bookings b
       LEFT JOIN service_categories c ON c.id = b.category_id
      WHERE b.created_at >= NOW() - (($1::int) || ' days')::interval
      GROUP BY c.name
      ORDER BY COUNT(b.id) DESC
      LIMIT 12`,
    [n],
  );

  return rows.rows.map((r) => ({ category: r.category, count: Number(r.count) })); // SAFE-N+1: in-memory row-to-DTO projection of LIMIT-12 result; no DB calls inside map.
}

export async function getCustomerAcquisitionFunnel(days: number): Promise<AcquisitionFunnel> {
  const n = clampDays(days, 1, 365);
  const result = await db.query<{
    registered: string;
    first_booking: string;
    repeat_booking: string;
  }>(
    `WITH registered_customers AS (
       SELECT id, created_at
         FROM users
        WHERE role = 'customer'
          AND created_at >= NOW() - (($1::int) || ' days')::interval
     ),
     bookings_by_customer AS (
       SELECT b.customer_id, COUNT(*) AS booking_count
         FROM bookings b
         JOIN registered_customers rc ON rc.id = b.customer_id
        WHERE b.created_at >= rc.created_at
        GROUP BY b.customer_id
     )
     SELECT
       (SELECT COUNT(*) FROM registered_customers)::text AS registered,
       (SELECT COUNT(*) FROM bookings_by_customer WHERE booking_count >= 1)::text AS first_booking,
       (SELECT COUNT(*) FROM bookings_by_customer WHERE booking_count >= 2)::text AS repeat_booking`,
    [n],
  );

  const r = result.rows[0]!;
  return {
    registered: Number(r.registered),
    firstBooking: Number(r.first_booking),
    repeatBooking: Number(r.repeat_booking),
  };
}

interface RawAlertRow {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action_url: string | null;
  created_at: Date;
}

export async function getOperationalAlerts(): Promise<DashboardAlert[]> {
  const [
    consecOneStarRows,
    staleDisputeRows,
    webhookFailureRows,
    nbiExpiringRows,
    chronicCustomerRows,
    underservedCityRows,
    guaranteeFundRows,
  ] = await Promise.all([
    // 1. Provider with 3+ consecutive 1-star ratings (most-recent run, by created_at desc)
    db.query<{ provider_id: string; full_name: string; consec: string; latest_at: Date }>(
      `WITH ranked AS (
         SELECT r.provider_id,
                r.rating,
                r.created_at,
                ROW_NUMBER() OVER (PARTITION BY r.provider_id ORDER BY r.created_at DESC) AS rn
           FROM reviews r
       ),
       latest_three AS (
         SELECT provider_id,
                BOOL_AND(rating = 1) AS all_one,
                MAX(created_at) AS latest_at
           FROM ranked
          WHERE rn <= 3
          GROUP BY provider_id
         HAVING COUNT(*) = 3
       )
       SELECT lt.provider_id, p.full_name, '3' AS consec, lt.latest_at
         FROM latest_three lt
         JOIN providers p ON p.id = lt.provider_id
        WHERE lt.all_one = TRUE
        ORDER BY lt.latest_at DESC
        LIMIT 25`,
    ),
    // 2. Disputes open >48h
    db.query<{ id: string; created_at: Date }>(
      `SELECT id, created_at
         FROM disputes
        WHERE status = 'open'
          AND created_at < NOW() - INTERVAL '48 hours'
        ORDER BY created_at ASC
        LIMIT 25`,
    ),
    // 3. Webhook failures last hour (audit_log entries)
    db.query<{ id: string; action: string; created_at: Date }>(
      `SELECT id, action, created_at
         FROM audit_log
        WHERE action ILIKE '%webhook%fail%'
          AND created_at >= NOW() - INTERVAL '1 hour'
        ORDER BY created_at DESC
        LIMIT 25`,
    ),
    // 4. Provider NBI expiring in next 7 days
    db.query<{ provider_id: string; full_name: string; nbi_expiry_date: Date }>(
      `SELECT id AS provider_id, full_name, nbi_expiry_date
         FROM providers
        WHERE status = 'approved'
          AND nbi_expiry_date IS NOT NULL
          AND nbi_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY nbi_expiry_date ASC
        LIMIT 25`,
    ),
    // 5. Customer with 5+ disputes in last 7 days
    db.query<{ customer_id: string; dispute_count: string; latest_at: Date }>(
      `SELECT b.customer_id,
              COUNT(d.id)::text AS dispute_count,
              MAX(d.created_at) AS latest_at
         FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
        WHERE d.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY b.customer_id
       HAVING COUNT(d.id) >= 5
        ORDER BY MAX(d.created_at) DESC
        LIMIT 25`,
    ),
    // 6. Active service area with <5 active providers
    db.query<{ id: string; name: string; active_provider_count: number }>(
      `SELECT id, name, active_provider_count
         FROM service_areas
        WHERE status = 'active'
          AND active_provider_count < 5
        ORDER BY active_provider_count ASC, name ASC
        LIMIT 25`,
    ),
    // 7. Guarantee fund balance below 30% of monthly claim burn
    db.query<{ balance: string; burn: string }>(
      `SELECT
         COALESCE((SELECT available_balance FROM wallets WHERE type = 'guarantee_fund' AND user_id IS NULL), 0)::text AS balance,
         COALESCE(
           (SELECT ABS(SUM(wt.amount))
              FROM wallet_transactions wt
              JOIN wallets w ON w.id = wt.wallet_id
             WHERE w.type = 'guarantee_fund'
               AND wt.amount < 0
               AND wt.created_at >= NOW() - INTERVAL '30 days'),
           0
         )::text AS burn`,
    ),
  ]);

  const alerts: RawAlertRow[] = [];

  for (const r of consecOneStarRows.rows) {
    alerts.push({
      id: `consec-1star:${r.provider_id}`,
      type: 'provider_consecutive_one_star',
      severity: 'danger',
      title: `${r.full_name}: 3 consecutive 1-star reviews`,
      description: `Quality intervention recommended. Latest: ${r.latest_at.toISOString()}.`,
      action_url: `/providers/${r.provider_id}`,
      created_at: r.latest_at,
    });
  }

  for (const r of staleDisputeRows.rows) {
    alerts.push({
      id: `dispute-stale:${r.id}`,
      type: 'dispute_open_over_48h',
      severity: 'warning',
      title: `Dispute open for over 48 hours`,
      description: `Dispute ${r.id} opened ${r.created_at.toISOString()} and remains in 'open' status.`,
      action_url: `/disputes/${r.id}`,
      created_at: r.created_at,
    });
  }

  for (const r of webhookFailureRows.rows) {
    alerts.push({
      id: `webhook-fail:${r.id}`,
      type: 'paymongo_webhook_failure',
      severity: 'danger',
      title: 'PayMongo webhook failure',
      description: `Audit action: ${r.action}. Investigate payment intent state.`,
      action_url: '/audit-log',
      created_at: r.created_at,
    });
  }

  for (const r of nbiExpiringRows.rows) {
    alerts.push({
      id: `nbi-expiring:${r.provider_id}`,
      type: 'provider_nbi_expiring',
      severity: 'warning',
      title: `${r.full_name}: NBI clearance expires soon`,
      description: `Expiry date ${r.nbi_expiry_date.toISOString().slice(0, 10)}. Provider must renew to remain approved.`,
      action_url: `/providers/${r.provider_id}`,
      created_at: r.nbi_expiry_date,
    });
  }

  for (const r of chronicCustomerRows.rows) {
    alerts.push({
      id: `chronic-customer:${r.customer_id}`,
      type: 'customer_chronic_disputes',
      severity: 'warning',
      title: `Customer with ${r.dispute_count} disputes in last 7 days`,
      description: `Customer ${r.customer_id} has ${r.dispute_count} open/recent disputes. Review for abuse pattern.`,
      action_url: `/customers/${r.customer_id}`,
      created_at: r.latest_at,
    });
  }

  for (const r of underservedCityRows.rows) {
    alerts.push({
      id: `city-underserved:${r.id}`,
      type: 'city_low_provider_count',
      severity: 'info',
      title: `${r.name}: only ${r.active_provider_count} active providers`,
      description: 'Active service area has fewer than 5 active providers. Consider recruitment campaign.',
      action_url: `/service-areas/${r.id}`,
      created_at: new Date(),
    });
  }

  const fundRow = guaranteeFundRows.rows[0];
  if (fundRow) {
    const balance = Number(fundRow.balance);
    const burn = Number(fundRow.burn);
    if (burn > 0 && balance < burn * 0.3) {
      alerts.push({
        id: `guarantee-fund-low:${Date.now()}`,
        type: 'guarantee_fund_low',
        severity: 'danger',
        title: 'Guarantee fund below 30% of monthly claim burn',
        description: `Balance ₱${(balance / 100).toFixed(2)} vs 30-day burn ₱${(burn / 100).toFixed(2)}. Replenishment needed.`,
        action_url: '/financials/wallets',
        created_at: new Date(),
      });
    }
  }

  alerts.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  return alerts.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    description: a.description,
    action_url: a.action_url,
    created_at: a.created_at.toISOString(),
  }));
}

export async function getCitiesPerformance(): Promise<CityPerformance[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    status: string;
    active_provider_count: number;
    today_bookings: string;
  }>(
    `SELECT sa.id,
            sa.name,
            sa.status,
            sa.active_provider_count,
            COALESCE((
              SELECT COUNT(*)
                FROM bookings b
                JOIN provider_service_areas psa ON psa.provider_id = b.provider_id
               WHERE psa.service_area_id = sa.id
                 AND b.created_at >= DATE_TRUNC('day', NOW())
            ), 0)::text AS today_bookings
       FROM service_areas sa
      WHERE sa.status IN ('active', 'soft_launch', 'recruiting', 'planned')
      ORDER BY
        CASE sa.status
          WHEN 'active'      THEN 0
          WHEN 'soft_launch' THEN 1
          WHEN 'recruiting'  THEN 2
          ELSE 3
        END,
        sa.name ASC
      LIMIT 24`,
  );

  return rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    activeProviders: Number(r.active_provider_count),
    todayBookings: Number(r.today_bookings),
  }));
}


