import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface KpiRow {
  today_revenue: string;
  active_bookings: string;
  pending_disputes: string;
  new_signups_today: string;
  pending_provider_approvals: string;
  platform_escrow_balance: string;
  platform_revenue_balance: string;
  guarantee_fund_balance: string;
}

interface ProviderAdminRow {
  id: string;
  user_id: string;
  business_name: string;
  description: string;
  tier: string;
  status: string;
  rating: string;
  total_reviews: number;
  total_jobs: number;
  service_radius_km: number;
  is_available: boolean;
  city: string | null;
  province: string | null;
  created_at: Date;
  updated_at: Date;
  phone: string;
  email: string | null;
  full_name: string;
}

interface CustomerAdminRow {
  id: string;
  phone: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  total_bookings: string;
  total_spent: string;
  total_disputes: string;
}

interface BookingAdminRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  category_id: string;
  status: string;
  escrow_status: string;
  total_amount: string;
  city: string;
  scheduled_at: Date;
  created_at: Date;
  customer_name: string;
  provider_name: string | null;
  category_name: string;
}

interface RevenueRow {
  date: string;
  total_commission: string;
  total_service_fees: string;
  total_refunds: string;
  booking_count: string;
}

interface AdminActionRow {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  reason: string | null;
  created_at: Date;
}

interface CountRow { count: string }

export async function getDashboardKpis(): Promise<Record<string, unknown>> {
  const [kpis, recentBookings, alertCounts] = await Promise.all([
    db.query<KpiRow>(`
      SELECT
        COALESCE((SELECT SUM(amount) FROM wallet_transactions
          WHERE type IN ('commission', 'service_fee') AND created_at >= CURRENT_DATE), 0)::text AS today_revenue,
        (SELECT COUNT(*) FROM bookings WHERE status NOT IN (
          'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin', 'paid_out', 'confirmed', 'resolved'
        ))::text AS active_bookings,
        (SELECT COUNT(*) FROM disputes WHERE status IN ('open', 'under_review', 'escalated'))::text AS pending_disputes,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE)::text AS new_signups_today,
        (SELECT COUNT(*) FROM providers WHERE status = 'pending')::text AS pending_provider_approvals,
        COALESCE((SELECT pending_balance FROM wallets WHERE type = 'platform_escrow' AND user_id IS NULL), 0)::text AS platform_escrow_balance,
        COALESCE((SELECT available_balance FROM wallets WHERE type = 'platform_revenue' AND user_id IS NULL), 0)::text AS platform_revenue_balance,
        COALESCE((SELECT available_balance FROM wallets WHERE type = 'guarantee_fund' AND user_id IS NULL), 0)::text AS guarantee_fund_balance
    `),
    db.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM bookings WHERE created_at >= CURRENT_DATE`),
    db.query<{ escalated: string; stale: string }>(`
      SELECT
        (SELECT COUNT(*) FROM disputes WHERE status = 'escalated')::text AS escalated,
        (SELECT COUNT(*) FROM disputes WHERE status = 'open' AND created_at < NOW() - INTERVAL '48 hours')::text AS stale
    `),
  ]);

  const k = kpis.rows[0]!;
  return {
    todayRevenue: Number(k.today_revenue),
    activeBookings: Number(k.active_bookings),
    pendingDisputes: Number(k.pending_disputes),
    newSignupsToday: Number(k.new_signups_today),
    pendingProviderApprovals: Number(k.pending_provider_approvals),
    todayBookings: Number(recentBookings.rows[0]?.count ?? 0),
    platformWallets: {
      escrow: Number(k.platform_escrow_balance),
      revenue: Number(k.platform_revenue_balance),
      guaranteeFund: Number(k.guarantee_fund_balance),
    },
    alerts: {
      escalatedDisputes: Number(alertCounts.rows[0]?.escalated ?? 0),
      staleDisputes: Number(alertCounts.rows[0]?.stale ?? 0),
    },
  };
}

export async function listProviders(
  filters: { status?: string; tier?: string; search?: string; page: number; pageSize: number },
): Promise<{ providers: ProviderAdminRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`p.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.tier) {
    conditions.push(`p.tier = $${paramIdx++}`);
    params.push(filters.tier);
  }
  if (filters.search) {
    conditions.push(`(p.business_name ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM providers p JOIN users u ON u.id = p.user_id ${whereClause}`,
    params,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<ProviderAdminRow>(
    `SELECT p.*, u.phone, u.email, CONCAT(u.first_name, ' ', u.last_name) as full_name
     FROM providers p
     JOIN users u ON u.id = p.user_id
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { providers: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function approveProvider(providerId: string, adminId: string): Promise<void> {
  await db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE providers SET status = 'approved', reviewed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id`,
      [providerId],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not in pending status.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'provider_approved', 'provider', $2, '{"action":"approved"}'::jsonb)`,
      [adminId, providerId],
    );

    interface UserIdRow { user_id: string }
    const provider = await client.query<UserIdRow>(`SELECT user_id FROM providers WHERE id = $1`, [providerId]);
    if (provider.rows[0]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'tier_upgrade', 'Account Approved', 'Congratulations! Your provider account has been approved. You can now start accepting jobs.', $2)`,
        [provider.rows[0].user_id, JSON.stringify({ providerId })],
      );
    }
  });

  logger.info('Provider approved', { providerId, adminId });
}

export async function rejectProvider(providerId: string, adminId: string, reason: string): Promise<void> {
  await db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE providers SET status = 'rejected', rejection_reason = $2, reviewed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id`,
      [providerId, reason],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not in pending status.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_rejected', 'provider', $2, '{"action":"rejected"}'::jsonb, $3)`,
      [adminId, providerId, reason],
    );

    interface UserIdRow { user_id: string }
    const provider = await client.query<UserIdRow>(`SELECT user_id FROM providers WHERE id = $1`, [providerId]);
    if (provider.rows[0]) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'provider_rejected', 'Application Declined', $2, $3)`,
        [provider.rows[0].user_id,
         `Your provider application has been declined. Reason: ${reason}. Please contact support for more information.`,
         JSON.stringify({ providerId, reason })],
      );
    }
  });

  logger.info('Provider rejected', { providerId, adminId, reason });
}

export async function suspendProvider(providerId: string, adminId: string, reason: string): Promise<void> {
  await db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE providers SET status = 'suspended', updated_at = NOW() WHERE id = $1 AND status IN ('approved', 'pending') RETURNING id`,
      [providerId],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or already suspended.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_suspended', 'provider', $2, $3, $4)`,
      [adminId, providerId, JSON.stringify({ action: 'suspended' }), reason],
    );
  });

  logger.info('Provider suspended', { providerId, adminId, reason });
}

export async function reactivateProvider(providerId: string, adminId: string): Promise<void> {
  await db.transaction(async (client) => {
    const result = await client.query(
      `UPDATE providers SET status = 'approved', updated_at = NOW() WHERE id = $1 AND status = 'suspended' RETURNING id`,
      [providerId],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not suspended.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'provider_reactivated', 'provider', $2, '{"action":"reactivated"}'::jsonb)`,
      [adminId, providerId],
    );
  });

  logger.info('Provider reactivated', { providerId, adminId });
}

export async function changeProviderTier(
  providerId: string,
  adminId: string,
  newTier: string,
  reason: string,
): Promise<void> {
  interface TierRow { tier: string }
  const current = await db.query<TierRow>(`SELECT tier FROM providers WHERE id = $1`, [providerId]);
  if (current.rows.length === 0) throw createAppError('Provider not found.', 404);
  const oldTier = current.rows[0]!.tier;

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE providers SET tier = $1, updated_at = NOW() WHERE id = $2`,
      [newTier, providerId],
    );

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_tier_changed', 'provider', $2, $3, $4)`,
      [adminId, providerId, JSON.stringify({ oldTier, newTier }), reason],
    );
  });

  logger.info('Provider tier changed', { providerId, adminId, oldTier, newTier });
}

export async function listCustomers(
  filters: { search?: string; status?: string; page: number; pageSize: number },
): Promise<{ customers: CustomerAdminRow[]; total: number }> {
  const conditions: string[] = [`u.role = 'customer'`];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.search) {
    conditions.push(`(u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }
  if (filters.status) {
    conditions.push(`u.is_active = $${paramIdx++}`);
    params.push(filters.status === 'active');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM users u ${whereClause}`,
    params,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<CustomerAdminRow>(
    `SELECT u.id, u.phone, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at, u.updated_at,
       (SELECT COUNT(*) FROM bookings WHERE customer_id = u.id)::text AS total_bookings,
       COALESCE((SELECT SUM(total_amount) FROM bookings WHERE customer_id = u.id AND status IN ('confirmed', 'payout_ready', 'paid_out')), 0)::text AS total_spent,
       (SELECT COUNT(*) FROM disputes WHERE filed_by = u.id)::text AS total_disputes
     FROM users u
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { customers: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function listBookingsAdmin(
  filters: { status?: string; search?: string; page: number; pageSize: number },
): Promise<{ bookings: BookingAdminRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`b.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`(b.id::text ILIKE $${paramIdx} OR b.city ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM bookings b ${whereClause}`,
    params,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<BookingAdminRow>(
    `SELECT b.id, b.customer_id, b.provider_id, b.category_id, b.status,
       b.escrow_status, b.total_amount::text, b.city, b.scheduled_at, b.created_at,
       CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
       p.business_name AS provider_name,
       sc.name AS category_name
     FROM bookings b
     JOIN users u ON u.id = b.customer_id
     LEFT JOIN providers p ON p.id = b.provider_id
     LEFT JOIN service_categories sc ON sc.id = b.category_id
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  return { bookings: dataResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export async function getRevenueReport(
  period: 'daily' | 'weekly' | 'monthly',
  days = 30,
): Promise<RevenueRow[]> {
  const truncUnit = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month';

  const result = await db.query<RevenueRow>(
    `SELECT
       date_trunc('${truncUnit}', wt.created_at)::date::text AS date,
       COALESCE(SUM(CASE WHEN wt.type = 'commission' THEN wt.amount ELSE 0 END), 0)::text AS total_commission,
       COALESCE(SUM(CASE WHEN wt.type = 'service_fee' THEN wt.amount ELSE 0 END), 0)::text AS total_service_fees,
       COALESCE(SUM(CASE WHEN wt.type = 'refund' THEN ABS(wt.amount) ELSE 0 END), 0)::text AS total_refunds,
       COUNT(DISTINCT wt.booking_id)::text AS booking_count
     FROM wallet_transactions wt
     WHERE wt.created_at >= NOW() - make_interval(days => $1)
       AND wt.type IN ('commission', 'service_fee', 'refund')
     GROUP BY date_trunc('${truncUnit}', wt.created_at)
     ORDER BY date ASC`,
    [days],
  );

  return result.rows;
}

export async function getAdminActions(
  filters: { adminId?: string; actionType?: string; page: number; pageSize: number },
  viewerRole?: string,
): Promise<{ actions: AdminActionRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.adminId) {
    conditions.push(`a.admin_id = $${paramIdx++}`);
    params.push(filters.adminId);
  }
  if (filters.actionType) {
    conditions.push(`a.action_type = $${paramIdx++}`);
    params.push(filters.actionType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM admin_actions a ${whereClause}`,
    params,
  );

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<AdminActionRow>(
    `SELECT * FROM admin_actions a ${whereClause} ORDER BY a.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  // Phase 14 Dispatch 08 — Bug 66 + 75 + 76 + 81 + 311 + 331.
  // Apply role-aware PII masking before returning. super_admin sees raw;
  // dpo sees masked UA + raw IP; everyone else sees fully masked.
  const { maskPiiForRole } = await import('../utils/pii-mask');
  const role = viewerRole ?? 'admin';
  const masked = dataResult.rows.map((row) => maskPiiForRole(row as unknown as { details?: Record<string, unknown> }, role)) as unknown as AdminActionRow[];

  return { actions: masked, total: Number(countResult.rows[0]?.count ?? 0) };
}

export function formatProvider(p: ProviderAdminRow): Record<string, unknown> {
  return {
    id: p.id,
    userId: p.user_id,
    businessName: p.business_name,
    tier: p.tier,
    status: p.status,
    rating: Number(p.rating),
    totalReviews: p.total_reviews,
    totalJobs: p.total_jobs,
    serviceRadiusKm: p.service_radius_km,
    isAvailable: p.is_available,
    city: p.city,
    province: p.province,
    phone: p.phone,
    email: p.email,
    fullName: p.full_name,
    createdAt: p.created_at,
  };
}

export function formatCustomer(c: CustomerAdminRow): Record<string, unknown> {
  return {
    id: c.id,
    phone: c.phone,
    email: c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    status: c.is_active ? 'active' : 'inactive',
    totalBookings: Number(c.total_bookings),
    totalSpent: Number(c.total_spent),
    totalDisputes: Number(c.total_disputes),
    createdAt: c.created_at,
  };
}

export function formatBookingAdmin(b: BookingAdminRow): Record<string, unknown> {
  return {
    id: b.id,
    customerId: b.customer_id,
    providerId: b.provider_id,
    categoryId: b.category_id,
    status: b.status,
    escrowStatus: b.escrow_status,
    totalAmount: Number(b.total_amount),
    city: b.city,
    scheduledAt: b.scheduled_at,
    customerName: b.customer_name,
    providerName: b.provider_name,
    categoryName: b.category_name,
    createdAt: b.created_at,
  };
}

export function formatRevenueRow(r: RevenueRow): Record<string, unknown> {
  return {
    date: r.date,
    totalCommission: Number(r.total_commission),
    totalServiceFees: Number(r.total_service_fees),
    totalRefunds: Number(r.total_refunds),
    bookingCount: Number(r.booking_count),
  };
}

export function formatAdminAction(a: AdminActionRow): Record<string, unknown> {
  return {
    id: a.id,
    adminId: a.admin_id,
    actionType: a.action_type,
    targetType: a.target_type,
    targetId: a.target_id,
    details: a.details,
    reason: a.reason,
    createdAt: a.created_at,
  };
}
