import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as settingsService from './settings.service';

// --- Interfaces ---

interface EarningsGoalRow {
  id: string;
  provider_id: string;
  period_type: 'daily' | 'weekly' | 'monthly';
  target_amount: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface EarningsSummaryRow {
  earned_today: string;
  earned_this_week: string;
  earned_this_month: string;
  pending_escrow: string;
  total_jobs_today: string;
  total_jobs_week: string;
  total_jobs_month: string;
}

interface EarningsTrendRow {
  period: string;
  total_earned: string;
  total_commission: string;
  net_earned: string;
  job_count: string;
}

interface DemandInsightRow {
  hour_of_day: string;
  day_of_week: string;
  booking_count: string;
}

interface CategoryEarningsRow {
  category_id: string;
  category_name: string;
  total_earned: string;
  job_count: string;
}

interface ReceiptBookingRow {
  id: string;
  description: string;
  scheduled_at: Date;
  completed_at: Date | null;
  service_price: number;
  total_amount: number;
  service_fee: number;
  status: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  category_name: string;
  subcategory_name: string | null;
}

interface ProviderInfoRow {
  id: string;
  user_id: string;
  business_name: string;
  tier: string;
  first_name: string;
  last_name: string;
  phone: string;
}

// --- Earnings Goals ---

export async function setEarningsGoal(
  providerId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  targetAmount: number,
): Promise<EarningsGoalRow> {
  if (targetAmount <= 0) {
    throw createAppError('Target amount must be positive.', 400);
  }

  const result = await db.query<EarningsGoalRow>(
    `INSERT INTO provider_earnings_goals (provider_id, period_type, target_amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider_id, period_type) DO UPDATE SET
       target_amount = EXCLUDED.target_amount,
       is_active = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [providerId, periodType, targetAmount],
  );

  logger.info('Earnings goal set', { providerId, periodType, targetAmount });
  return result.rows[0]!;
}

export async function getEarningsGoals(
  providerId: string,
): Promise<EarningsGoalRow[]> {
  const result = await db.query<EarningsGoalRow>(
    `SELECT * FROM provider_earnings_goals
     WHERE provider_id = $1 AND is_active = TRUE
     ORDER BY CASE period_type WHEN 'daily' THEN 0 WHEN 'weekly' THEN 1 ELSE 2 END`,
    [providerId],
  );
  return result.rows;
}

export async function removeEarningsGoal(
  providerId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
): Promise<void> {
  const result = await db.query(
    `UPDATE provider_earnings_goals SET is_active = FALSE, updated_at = NOW()
     WHERE provider_id = $1 AND period_type = $2 AND is_active = TRUE`,
    [providerId, periodType],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createAppError('Earnings goal not found.', 404);
  }
}

// --- Earnings Summary & Progress ---

export async function getEarningsSummary(
  providerId: string,
): Promise<{
  earnedToday: number;
  earnedThisWeek: number;
  earnedThisMonth: number;
  pendingEscrow: number;
  jobsToday: number;
  jobsThisWeek: number;
  jobsThisMonth: number;
}> {
  const result = await db.query<EarningsSummaryRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN b.confirmed_at >= CURRENT_DATE THEN wt.amount ELSE 0 END), 0)::text AS earned_today,
       COALESCE(SUM(CASE WHEN b.confirmed_at >= DATE_TRUNC('week', CURRENT_DATE) THEN wt.amount ELSE 0 END), 0)::text AS earned_this_week,
       COALESCE(SUM(CASE WHEN b.confirmed_at >= DATE_TRUNC('month', CURRENT_DATE) THEN wt.amount ELSE 0 END), 0)::text AS earned_this_month,
       '0'::text AS pending_escrow,
       COUNT(CASE WHEN b.confirmed_at >= CURRENT_DATE THEN 1 END)::text AS total_jobs_today,
       COUNT(CASE WHEN b.confirmed_at >= DATE_TRUNC('week', CURRENT_DATE) THEN 1 END)::text AS total_jobs_week,
       COUNT(CASE WHEN b.confirmed_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END)::text AS total_jobs_month
     FROM wallet_transactions wt
     INNER JOIN wallets w ON wt.wallet_id = w.id
     INNER JOIN bookings b ON wt.booking_id = b.id
     WHERE w.user_id = (SELECT user_id FROM providers WHERE id = $1)
       AND w.type = 'provider'
       AND wt.type = 'escrow_release'
       AND wt.amount > 0`,
    [providerId],
  );

  // MED-N34 fix: pre-fix returned `pendingEscrow` as gross
  // SUM(service_price), but the dashboard's `earned*` totals are
  // NET (post-commission via wallet_transactions). Mixed units
  // misled the provider into thinking they'd receive a higher
  // payout than they actually would.
  //
  // Now: read the provider's tier and compute pending net of
  // commission for each booking. Falls back to platformConfig if
  // settings is unreachable so the dashboard still renders.
  let commissionRate = 0.15; // safe default = highest tier rate
  try {
    const tierRow = await db.query<{ tier: string }>(
      `SELECT tier FROM providers WHERE id = $1`,
      [providerId],
    );
    if (tierRow.rows[0]) {
      commissionRate = await settingsService.getCommissionRate(tierRow.rows[0].tier);
    }
  } catch (err) {
    logger.warn('Commission rate lookup failed in earnings summary; using 0.15 default', {
      providerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const escrowResult = await db.query<{ pending_gross: string }>(
    `SELECT COALESCE(SUM(b.service_price), 0)::text AS pending_gross
     FROM bookings b
     WHERE b.provider_id = $1
       AND b.status IN ('paid', 'provider_en_route', 'provider_arrived', 'in_progress', 'completed_by_provider')`,
    [providerId],
  );
  const pendingGross = Number(escrowResult.rows[0]?.pending_gross ?? 0);
  const pendingNet = Math.round(pendingGross * (1 - commissionRate));

  const row = result.rows[0]!;
  return {
    earnedToday: Number(row.earned_today),
    earnedThisWeek: Number(row.earned_this_week),
    earnedThisMonth: Number(row.earned_this_month),
    pendingEscrow: pendingNet, // MED-N34: now net of commission
    jobsToday: Number(row.total_jobs_today),
    jobsThisWeek: Number(row.total_jobs_week),
    jobsThisMonth: Number(row.total_jobs_month),
  };
}

export async function getGoalProgress(
  providerId: string,
): Promise<Array<{
  periodType: string;
  targetAmount: number;
  currentAmount: number;
  progressPercent: number;
  remainingAmount: number;
}>> {
  const goals = await getEarningsGoals(providerId);
  if (goals.length === 0) return [];

  const summary = await getEarningsSummary(providerId);
  const earningsMap: Record<string, number> = {
    daily: summary.earnedToday,
    weekly: summary.earnedThisWeek,
    monthly: summary.earnedThisMonth,
  };

  return goals.map((g) => {
    const current = earningsMap[g.period_type] ?? 0;
    const progress = Math.min(100, Math.round((current / g.target_amount) * 100));
    return {
      periodType: g.period_type,
      targetAmount: g.target_amount,
      currentAmount: current,
      progressPercent: progress,
      remainingAmount: Math.max(0, g.target_amount - current),
    };
  });
}

// --- Earnings Trends ---

export async function getEarningsTrends(
  providerId: string,
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  days = 30,
): Promise<Array<{
  period: string;
  totalEarned: number;
  totalCommission: number;
  netEarned: number;
  jobCount: number;
}>> {
  const safeDays = Math.min(365, Math.max(1, days));

  let truncExpr: string;
  switch (period) {
    case 'weekly': truncExpr = "DATE_TRUNC('week', b.confirmed_at)"; break;
    case 'monthly': truncExpr = "DATE_TRUNC('month', b.confirmed_at)"; break;
    default: truncExpr = 'b.confirmed_at::date'; break;
  }

  const result = await db.query<EarningsTrendRow>(
    `SELECT
       ${truncExpr}::text AS period,
       COALESCE(SUM(b.service_price), 0)::text AS total_earned,
       COALESCE(SUM(b.service_price - wt.amount), 0)::text AS total_commission,
       COALESCE(SUM(wt.amount), 0)::text AS net_earned,
       COUNT(*)::text AS job_count
     FROM bookings b
     INNER JOIN wallet_transactions wt ON wt.booking_id = b.id
     INNER JOIN wallets w ON wt.wallet_id = w.id
     WHERE b.provider_id = $1
       AND w.user_id = (SELECT user_id FROM providers WHERE id = $1)
       AND w.type = 'provider'
       AND wt.type = 'escrow_release'
       AND wt.amount > 0
       AND b.confirmed_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY ${truncExpr}
     ORDER BY period ASC`,
    [providerId, safeDays],
  );

  return result.rows.map((r) => ({
    period: r.period,
    totalEarned: Number(r.total_earned),
    totalCommission: Number(r.total_commission),
    netEarned: Number(r.net_earned),
    jobCount: Number(r.job_count),
  }));
}

// --- Earnings by Category ---

export async function getEarningsByCategory(
  providerId: string,
  days = 90,
): Promise<Array<{
  categoryId: string;
  categoryName: string;
  totalEarned: number;
  jobCount: number;
}>> {
  const safeDays = Math.min(365, Math.max(1, days));

  const result = await db.query<CategoryEarningsRow>(
    `SELECT
       sc.id AS category_id,
       sc.name AS category_name,
       COALESCE(SUM(wt.amount), 0)::text AS total_earned,
       COUNT(*)::text AS job_count
     FROM bookings b
     INNER JOIN wallet_transactions wt ON wt.booking_id = b.id
     INNER JOIN wallets w ON wt.wallet_id = w.id
     LEFT JOIN service_categories sc ON b.category_id = sc.id
     WHERE b.provider_id = $1
       AND w.user_id = (SELECT user_id FROM providers WHERE id = $1)
       AND w.type = 'provider'
       AND wt.type = 'escrow_release'
       AND wt.amount > 0
       AND b.confirmed_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY sc.id, sc.name
     ORDER BY COALESCE(SUM(wt.amount), 0) DESC`,
    [providerId, safeDays],
  );

  return result.rows.map((r) => ({
    categoryId: r.category_id,
    categoryName: r.category_name ?? 'Unknown',
    totalEarned: Number(r.total_earned),
    jobCount: Number(r.job_count),
  }));
}

// --- Demand Insights ---

export async function getDemandInsights(
  providerId: string,
  days = 90,
): Promise<{
  bestHours: Array<{ hour: number; bookingCount: number }>;
  bestDays: Array<{ dayOfWeek: number; dayName: string; bookingCount: number }>;
  peakTimes: string[];
}> {
  const safeDays = Math.min(365, Math.max(1, days));

  const providerArea = await db.query<{ city: string | null }>(
    `SELECT p.city FROM providers p WHERE p.id = $1`,
    [providerId],
  );

  const areaCity = providerArea.rows[0]?.city;

  // MED-N30 fix: timezone is now passed as a SQL parameter ($N) so
  // it can never be SQL-injected. Pre-fix interpolated platformConfig.
  // timezone directly into the query string. Today timezone is a
  // hardcoded literal ('Asia/Manila') so it was safe in practice,
  // but if Phase 17 makes it admin-tunable through platform_settings
  // the interpolation would have become a live injection vector.
  let cityClause = '';
  const params: unknown[] = [safeDays, platformConfig.timezone];

  if (areaCity) {
    cityClause = 'AND b.city ILIKE $3';
    params.push(`%${areaCity}%`);
  }

  const hourResult = await db.query<DemandInsightRow>(
    `SELECT
       EXTRACT(HOUR FROM b.scheduled_at AT TIME ZONE $2)::text AS hour_of_day,
       ''::text AS day_of_week,
       COUNT(*)::text AS booking_count
     FROM bookings b
     WHERE b.scheduled_at >= NOW() - INTERVAL '1 day' * $1
       AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
       ${cityClause}
     GROUP BY hour_of_day
     ORDER BY booking_count DESC`,
    params,
  );

  const dayResult = await db.query<DemandInsightRow>(
    `SELECT
       ''::text AS hour_of_day,
       EXTRACT(DOW FROM b.scheduled_at AT TIME ZONE $2)::text AS day_of_week,
       COUNT(*)::text AS booking_count
     FROM bookings b
     WHERE b.scheduled_at >= NOW() - INTERVAL '1 day' * $1
       AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
       ${cityClause}
     GROUP BY day_of_week
     ORDER BY booking_count DESC`,
    params,
  );

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const bestHours = hourResult.rows.map((r) => ({
    hour: Number(r.hour_of_day),
    bookingCount: Number(r.booking_count),
  }));

  const bestDays = dayResult.rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    dayName: dayNames[Number(r.day_of_week)] ?? 'Unknown',
    bookingCount: Number(r.booking_count),
  }));

  const peakTimes: string[] = [];
  if (bestHours.length > 0) {
    const top3Hours = bestHours.slice(0, 3);
    for (const h of top3Hours) {
      const startHour = h.hour;
      const endHour = (startHour + 1) % 24;
      const formatH = (n: number): string => {
        const ampm = n >= 12 ? 'PM' : 'AM';
        const hr = n % 12 || 12;
        return `${hr}${ampm}`;
      };
      peakTimes.push(`${formatH(startHour)}-${formatH(endHour)}`);
    }
  }

  return { bestHours, bestDays, peakTimes };
}

// --- Provider Receipt/Invoice Generator ---

export async function generateReceipt(
  providerId: string,
  bookingId: string,
): Promise<{
  provider: { businessName: string; name: string; phone: string; tier: string };
  booking: {
    id: string;
    description: string;
    scheduledAt: string;
    completedAt: string | null;
    serviceName: string;
    address: string;
    customer: { name: string; phone: string };
  };
  financial: {
    servicePrice: number;
    serviceFee: number;
    commissionRate: number;
    commissionAmount: number;
    netEarnings: number;
  };
  receiptNumber: string;
  generatedAt: string;
}> {
  const providerInfo = await db.query<ProviderInfoRow>(
    `SELECT p.id, p.user_id, p.business_name, p.tier,
            u.first_name, u.last_name, u.phone
     FROM providers p
     INNER JOIN users u ON p.user_id = u.id
     WHERE p.id = $1`,
    [providerId],
  );

  if (providerInfo.rows.length === 0) {
    throw createAppError('Provider not found.', 404);
  }
  const prov = providerInfo.rows[0]!;

  const booking = await db.query<ReceiptBookingRow>(
    `SELECT b.id, b.description, b.scheduled_at, b.completed_at,
            b.service_price, b.total_amount, b.service_fee, b.status,
            TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
            u.phone AS customer_phone,
            b.address, b.barangay, b.city, b.province,
            sc.name AS category_name,
            ss.name AS subcategory_name
     FROM bookings b
     INNER JOIN users u ON b.customer_id = u.id
     LEFT JOIN service_categories sc ON b.category_id = sc.id
     LEFT JOIN service_subcategories ss ON b.subcategory_id = ss.id
     WHERE b.id = $1 AND b.provider_id = $2`,
    [bookingId, providerId],
  );

  if (booking.rows.length === 0) {
    throw createAppError('Booking not found or does not belong to this provider.', 404);
  }
  const bk = booking.rows[0]!;

  if (!['confirmed', 'payout_ready', 'paid_out', 'completed_by_provider'].includes(bk.status)) {
    throw createAppError('Receipt can only be generated for completed bookings.', 400);
  }

  // MED-N31 + MED-N32 fix: read commission rate from settingsService
  // (which routes through admin-editable platform_settings, with
  // platformConfig fallback). Pre-fix used platformConfig directly,
  // ignoring any rate the admin had tuned via /admin/settings AND
  // missing the 'founding' tier entirely (D-J17 has since added it
  // to platformConfig as a defensive default, but settingsService
  // is still the canonical path).
  let commissionRate: number;
  try {
    commissionRate = await settingsService.getCommissionRate(prov.tier);
  } catch (err) {
    logger.warn('Commission rate lookup failed in receipt generation; using platformConfig fallback', {
      tier: prov.tier,
      error: err instanceof Error ? err.message : String(err),
    });
    commissionRate = platformConfig.commissionRates[prov.tier] ?? platformConfig.commissionRates['new']!;
  }
  const servicePrice = Number(bk.service_price);
  const commissionAmount = Math.round(servicePrice * commissionRate);
  const netEarnings = servicePrice - commissionAmount;

  // MED-N33 fix: receipt number now includes the FULL booking UUID
  // (not just first 8 hex chars). Pre-fix the 8-char prefix had a
  // ~50% UUID4 birthday-collision rate at ~77K bookings — very
  // real for a launching marketplace. Two providers with similarly-
  // prefixed booking UUIDs would have produced the same receipt
  // number. Format remains human-readable: RCP-YYYYMM-<full-uuid>.
  const receiptDate = new Date();
  const receiptNumber = `RCP-${receiptDate.getFullYear()}${String(receiptDate.getMonth() + 1).padStart(2, '0')}-${bookingId.toUpperCase()}`;

  const fullAddress = [bk.address, bk.barangay, bk.city, bk.province].filter(Boolean).join(', ');
  const serviceName = [bk.category_name, bk.subcategory_name].filter(Boolean).join(' — ');

  return {
    provider: {
      businessName: prov.business_name,
      name: `${prov.first_name} ${prov.last_name}`.trim(),
      phone: prov.phone,
      tier: prov.tier,
    },
    booking: {
      id: bk.id,
      description: bk.description ?? '',
      scheduledAt: bk.scheduled_at.toISOString(),
      completedAt: bk.completed_at?.toISOString() ?? null,
      serviceName,
      address: fullAddress,
      customer: { name: bk.customer_name, phone: bk.customer_phone },
    },
    financial: {
      servicePrice,
      serviceFee: bk.service_fee ?? 0,
      commissionRate,
      commissionAmount,
      netEarnings,
    },
    receiptNumber,
    generatedAt: receiptDate.toISOString(),
  };
}

// --- Monthly Summary for BIR Reporting ---

export async function getMonthlySummary(
  providerId: string,
  year: number,
  month: number,
): Promise<{
  year: number;
  month: number;
  totalGrossEarnings: number;
  totalCommission: number;
  totalNetEarnings: number;
  totalTips: number;
  totalJobs: number;
  totalPayouts: number;
  breakdown: Array<{
    date: string;
    bookingId: string;
    description: string;
    grossAmount: number;
    commission: number;
    netAmount: number;
  }>;
}> {
  if (month < 1 || month > 12) {
    throw createAppError('Month must be between 1 and 12.', 400);
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

  const jobsResult = await db.query<{
    booking_id: string;
    description: string;
    confirmed_at: Date | null;
    completed_at: Date | null;
    service_price: number;
    provider_received: string;
  }>(
    // BUG-PHASE18-09 fix: select completed_at too so the breakdown can
    // fall back when confirmed_at is null (booking in completed_by_provider
    // state hasn't been customer-confirmed yet). Pre-fix omitted the column.
    `SELECT
       b.id AS booking_id,
       COALESCE(b.description, sc.name, 'Service') AS description,
       b.confirmed_at,
       b.completed_at,
       b.service_price,
       COALESCE(wt.amount, 0)::text AS provider_received
     FROM bookings b
     LEFT JOIN service_categories sc ON b.category_id = sc.id
     LEFT JOIN wallet_transactions wt ON wt.booking_id = b.id
       AND wt.wallet_id = (
         SELECT w.id FROM wallets w WHERE w.user_id = (SELECT user_id FROM providers WHERE id = $1) AND w.type = 'provider'
       )
       AND wt.type = 'escrow_release'
       AND wt.amount > 0
     WHERE b.provider_id = $1
       -- MED-N35 fix: include 'completed_by_provider' so bookings
       -- that completed near month-end and haven't yet auto-
       -- confirmed are still reported. The COALESCE-based date
       -- filter below handles either confirmed_at OR completed_at
       -- so neither status is silently excluded.
       AND b.status IN ('confirmed', 'payout_ready', 'paid_out', 'completed_by_provider')
       AND COALESCE(b.confirmed_at, b.completed_at) >= $2::date
       AND COALESCE(b.confirmed_at, b.completed_at) < ($3::date + INTERVAL '1 day')
     ORDER BY COALESCE(b.confirmed_at, b.completed_at) ASC`,
    [providerId, startDate, endDateStr],
  );

  const tipsResult = await db.query<{ total_tips: string }>(
    `SELECT COALESCE(SUM(t.amount), 0)::text AS total_tips
     FROM tips t
     INNER JOIN bookings b ON t.booking_id = b.id
     WHERE b.provider_id = $1
       AND t.created_at >= $2::date
       AND t.created_at < ($3::date + INTERVAL '1 day')`,
    [providerId, startDate, endDateStr],
  );

  const payoutsResult = await db.query<{ total_payouts: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total_payouts
     FROM payouts
     WHERE provider_id = $1
       AND status = 'completed'
       AND completed_at >= $2::date
       AND completed_at < ($3::date + INTERVAL '1 day')`,
    [providerId, startDate, endDateStr],
  );

  let totalGross = 0;
  let totalNet = 0;
  // BUG-PHASE18-09 fix: the SQL above selects rows where COALESCE(b.confirmed_at,
  // b.completed_at) is in the month, so confirmed_at can be NULL when the
  // booking is in 'completed_by_provider' state (not yet customer-confirmed).
  // Pre-fix `r.confirmed_at.toISOString()` threw TypeError on null and bubbled
  // a 500 to the mobile provider monthly-summary screen. Fall back to
  // completed_at, then to today, so the date field is always set.
  const breakdown = jobsResult.rows.map((r) => {
    const gross = Number(r.service_price);
    const net = Number(r.provider_received);
    const commission = gross - net;
    totalGross += gross;
    totalNet += net;
    const dateRow = r as unknown as { confirmed_at: Date | null; completed_at?: Date | null };
    const dateValue = dateRow.confirmed_at ?? dateRow.completed_at ?? new Date();
    return {
      date: dateValue.toISOString().split('T')[0]!,
      bookingId: r.booking_id,
      description: r.description,
      grossAmount: gross,
      commission,
      netAmount: net,
    };
  });

  return {
    year,
    month,
    totalGrossEarnings: totalGross,
    totalCommission: totalGross - totalNet,
    totalNetEarnings: totalNet,
    totalTips: Number(tipsResult.rows[0]?.total_tips ?? 0),
    totalJobs: jobsResult.rows.length,
    totalPayouts: Number(payoutsResult.rows[0]?.total_payouts ?? 0),
    breakdown,
  };
}

// --- Materials List Generator ---

interface MaterialsLineItemRow {
  id: string;
  quote_id: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: number;
  line_total: number;
  item_type: string;
}

interface MaterialsBookingRow {
  booking_id: string;
  quote_id: string;
  customer_name: string;
  booking_description: string;
  scheduled_at: Date;
  address: string;
  city: string;
  category_name: string;
  subcategory_name: string | null;
}

export async function getMaterialsList(
  providerId: string,
  bookingId: string,
): Promise<{
  booking: {
    id: string;
    customerName: string;
    description: string;
    scheduledAt: string;
    address: string;
    serviceName: string;
  };
  materials: Array<{
    id: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
    itemType: string;
  }>;
  totalMaterialsCost: number;
  totalLaborCost: number;
  totalEquipmentCost: number;
  grandTotal: number;
}> {
  const bookingResult = await db.query<MaterialsBookingRow>(
    `SELECT b.id AS booking_id, bq.id AS quote_id,
            TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
            b.description AS booking_description,
            b.scheduled_at, b.address, b.city,
            sc.name AS category_name,
            ss.name AS subcategory_name
     FROM bookings b
     INNER JOIN booking_quotes bq ON bq.booking_id = b.id AND bq.status = 'accepted'
     INNER JOIN users u ON b.customer_id = u.id
     LEFT JOIN service_categories sc ON b.category_id = sc.id
     LEFT JOIN service_subcategories ss ON b.subcategory_id = ss.id
     WHERE b.id = $1 AND b.provider_id = $2`,
    [bookingId, providerId],
  );

  if (bookingResult.rows.length === 0) {
    throw createAppError('Booking not found, not assigned to you, or has no accepted quote.', 404);
  }

  const bk = bookingResult.rows[0]!;

  const lineItems = await db.query<MaterialsLineItemRow>(
    `SELECT * FROM quote_line_items WHERE quote_id = $1 ORDER BY item_type ASC, created_at ASC`,
    [bk.quote_id],
  );

  let totalMaterials = 0;
  let totalLabor = 0;
  let totalEquipment = 0;

  const materials = lineItems.rows.map((li) => {
    const lineTotal = li.line_total;
    switch (li.item_type) {
      case 'materials': totalMaterials += lineTotal; break;
      case 'labor': totalLabor += lineTotal; break;
      case 'equipment': totalEquipment += lineTotal; break;
      default: totalMaterials += lineTotal; break;
    }
    return {
      id: li.id,
      description: li.description,
      quantity: Number(li.quantity),
      unit: li.unit,
      unitPrice: li.unit_price,
      lineTotal,
      itemType: li.item_type,
    };
  });

  const serviceName = [bk.category_name, bk.subcategory_name].filter(Boolean).join(' — ');

  return {
    booking: {
      id: bk.booking_id,
      customerName: bk.customer_name,
      description: bk.booking_description ?? '',
      scheduledAt: bk.scheduled_at.toISOString(),
      address: [bk.address, bk.city].filter(Boolean).join(', '),
      serviceName,
    },
    materials,
    totalMaterialsCost: totalMaterials,
    totalLaborCost: totalLabor,
    totalEquipmentCost: totalEquipment,
    grandTotal: totalMaterials + totalLabor + totalEquipment,
  };
}

// --- Formatters ---

export function formatEarningsGoal(g: EarningsGoalRow): Record<string, unknown> {
  return {
    id: g.id,
    providerId: g.provider_id,
    periodType: g.period_type,
    targetAmount: g.target_amount,
    isActive: g.is_active,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
}
