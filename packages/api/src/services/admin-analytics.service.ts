import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

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
        .map(([period, value]) => ({
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

  const result = await db.query<{
    user_id: string;
    name: string;
    phone: string;
    last_booking_date: Date | null;
    days_since_last: string;
    total_bookings: string;
    total_spent: string;
  }>(
    `SELECT
       u.id AS user_id,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
       u.phone,
       MAX(b.created_at) AS last_booking_date,
       COALESCE(EXTRACT(DAY FROM NOW() - MAX(b.created_at)), 999)::text AS days_since_last,
       COUNT(b.id)::text AS total_bookings,
       COALESCE(SUM(b.total_amount), 0)::text AS total_spent
     FROM users u
     LEFT JOIN bookings b ON b.customer_id = u.id
       AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
     WHERE u.role = 'customer'
     GROUP BY u.id, u.first_name, u.last_name, u.phone
     ORDER BY days_since_last DESC`,
  );

  const scored: ChurnRiskCustomer[] = result.rows.map((row) => {
    const daysSince = Number(row.days_since_last);
    const totalBookings = Number(row.total_bookings);
    const totalSpent = Number(row.total_spent);

    let riskScore = 0;
    if (daysSince >= 90) riskScore += 40;
    else if (daysSince >= 60) riskScore += 25;
    else if (daysSince >= 30) riskScore += 10;

    if (totalBookings <= 1) riskScore += 30;
    else if (totalBookings <= 3) riskScore += 15;

    if (totalSpent === 0) riskScore += 30;
    else if (totalSpent < 100000) riskScore += 10;

    riskScore = Math.min(100, riskScore);

    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (riskScore >= 80) level = 'critical';
    else if (riskScore >= 60) level = 'high';
    else if (riskScore >= 35) level = 'medium';

    return {
      userId: row.user_id,
      name: row.name,
      phone: row.phone,
      lastBookingDate: row.last_booking_date?.toISOString() ?? null,
      daysSinceLastBooking: daysSince,
      totalBookings,
      totalSpent,
      riskScore,
      riskLevel: level,
    };
  });

  const filtered = riskLevel
    ? scored.filter((c) => c.riskLevel === riskLevel)
    : scored;

  const total = filtered.length;
  const items = filtered.slice(offset, offset + safePageSize);

  return { items, total };
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

  const providers = await db.query<{
    provider_id: string;
    avg_rating: string;
    total_jobs: string;
    completed_jobs: string;
    cancelled_by_provider: string;
    on_time_jobs: string;
  }>(
    `SELECT
       p.id AS provider_id,
       COALESCE(p.rating, 0)::text AS avg_rating,
       COUNT(b.id)::text AS total_jobs,
       COUNT(b.id) FILTER (WHERE b.status IN ('confirmed', 'payout_ready', 'paid_out'))::text AS completed_jobs,
       COUNT(b.id) FILTER (WHERE b.status = 'cancelled_by_provider')::text AS cancelled_by_provider,
       COUNT(b.id) FILTER (
         WHERE b.status IN ('confirmed', 'payout_ready', 'paid_out')
           AND b.completed_at IS NOT NULL
           AND b.completed_at <= b.scheduled_at + INTERVAL '2 hours'
       )::text AS on_time_jobs
     FROM providers p
     LEFT JOIN bookings b ON b.provider_id = p.id
       AND b.created_at >= $1::date
     WHERE p.status = 'approved'
     GROUP BY p.id, p.rating`,
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

    const responseScore = 75;

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
    const currentRate = platformConfig.commissionRates[tier]!;

    const tierData = await db.query<{
      provider_count: string;
      avg_quality: string;
      avg_revenue: string;
      avg_bookings: string;
    }>(
      `SELECT
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
       WHERE p.tier = $1 AND p.status = 'approved'`,
      [tier],
    );

    const row = tierData.rows[0]!;
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
