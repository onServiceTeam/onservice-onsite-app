import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { applicationDecisionTransaction, assertCurrentApplicationRevision, recordApplicationDecision, requireExpectedApplicationRevision } from './provider-application-decision.service';
import {
  ACTIVE_BOOKING_STATUSES,
  ALL_BOOKING_STATUSES,
  COMPLETED_BOOKING_STATUSES,
} from '../types/booking.types';
import {
  maskEmail, maskPhilippinePhone, maskPiiForRole, maskPiiInString, type ActorRole,
} from '../utils/pii-mask';

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
  // DECIMAL columns — pg returns them as strings.
  latitude: string | null;
  longitude: string | null;
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
  is_flagged_fraud: boolean;
  created_at: Date;
  updated_at: Date;
  total_bookings: string;
  total_spent: string;
  active_bookings: string;
  total_disputes: string;
  open_disputes: string;
  open_support_tickets: string;
}

interface CustomerQueueSummaryRow {
  total_customers: string;
  active_accounts: string;
  inactive_accounts: string;
  fraud_flagged: string;
}

export interface CustomerQueueSummary {
  totalCustomers: number;
  activeAccounts: number;
  inactiveAccounts: number;
  fraudFlagged: number;
}

interface BookingAdminRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  category_id: string;
  booking_type: string;
  business_account_id: string | null;
  business_account_name: string | null;
  contract_id: string | null;
  contract_type: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  status: string;
  escrow_status: string;
  total_amount: string;
  city: string;
  scheduled_at: Date;
  created_at: Date;
  customer_name: string;
  provider_name: string | null;
  category_name: string;
  // DECIMAL columns — pg returns them as strings. Used by the dispatch map.
  latitude: string | null;
  longitude: string | null;
  open_support_tickets: string;
  unassigned_support_tickets: string;
  urgent_support_tickets: string;
  support_owner_names: string | null;
  open_disputes: string;
  past_scheduled: boolean;
}

interface BookingQueueSummaryRow {
  total_bookings: string;
  active_bookings: string;
  unassigned_active: string;
  open_support_bookings: string;
  disputed_bookings: string;
  past_scheduled_bookings: string;
}

export interface BookingQueueSummary {
  totalBookings: number;
  activeBookings: number;
  unassignedActive: number;
  openSupportBookings: number;
  disputedBookings: number;
  pastScheduledBookings: number;
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
  details: Record<string, unknown> | null;
  reason: string | null;
  created_at: Date;
}

interface CountRow { count: string }

export async function getDashboardKpis(): Promise<Record<string, unknown>> {
  // BUG-PHASE123-01 fix — pre-fix today_revenue / new_signups_today /
  // bookings_today used CURRENT_DATE, which Postgres computes in the
  // session timezone (UTC by default in our pool). For Manila admins,
  // that meant the dashboard's "today" KPIs were anchored to UTC
  // midnight — 16:00 UTC = 00:00 Manila next day, so during the
  // 16:00-23:59 UTC window (= 00:00-07:59 Manila next day) the
  // dashboard showed the previous day's data while the admin's wall
  // clock said "today." Same Manila-tz family as Phases 105/113/118/
  // 119/120/121. Anchored each "since today midnight Manila" boundary
  // to the UTC instant of Manila midnight via
  // `(now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila'`.
  const [kpis, recentBookings, alertCounts] = await Promise.all([
    db.query<KpiRow>(`
      SELECT
        COALESCE((SELECT SUM(amount) FROM wallet_transactions
          WHERE type IN ('commission', 'service_fee') AND created_at >= (now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila'), 0)::text AS today_revenue,
        (SELECT COUNT(*) FROM bookings WHERE status NOT IN (
          'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin', 'paid_out', 'confirmed', 'resolved'
        ))::text AS active_bookings,
        (SELECT COUNT(*) FROM disputes WHERE status IN ('open', 'under_review', 'escalated'))::text AS pending_disputes,
        (SELECT COUNT(*) FROM users WHERE created_at >= (now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila')::text AS new_signups_today,
        (SELECT COUNT(*) FROM providers WHERE status = 'pending')::text AS pending_provider_approvals,
        COALESCE((SELECT pending_balance FROM wallets WHERE type = 'platform_escrow' AND user_id IS NULL), 0)::text AS platform_escrow_balance,
        COALESCE((SELECT available_balance FROM wallets WHERE type = 'platform_revenue' AND user_id IS NULL), 0)::text AS platform_revenue_balance,
        COALESCE((SELECT available_balance FROM wallets WHERE type = 'guarantee_fund' AND user_id IS NULL), 0)::text AS guarantee_fund_balance
    `),
    db.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM bookings WHERE created_at >= (now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila'`),
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
  filters: {
    status?: string;
    tier?: string;
    search?: string;
    online?: boolean;
    serviceAreaId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ providers: ProviderAdminRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`p.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  // Phase 200 — dispatch console "online providers" feed. Online = approved
  // and currently accepting work (is_available). No params needed; both are
  // literal predicates. Combines (AND) with any explicit status/tier filter.
  if (filters.online) {
    conditions.push(`p.status = 'approved'`);
    conditions.push(`p.is_available = TRUE`);
  }
  if (filters.tier) {
    conditions.push(`p.tier = $${paramIdx++}`);
    params.push(filters.tier);
  }
  if (filters.search) {
    conditions.push(`(
      COALESCE(p.business_name, '') ILIKE $${paramIdx}
      OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${paramIdx}
      OR u.phone ILIKE $${paramIdx}
      OR COALESCE(u.email, '') ILIKE $${paramIdx}
      OR p.id::text ILIKE $${paramIdx}
      OR u.id::text ILIKE $${paramIdx}
    )`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }
  if (filters.serviceAreaId) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM provider_service_areas psa
         WHERE psa.provider_id = p.id AND psa.service_area_id = $${paramIdx++}
      )`,
    );
    params.push(filters.serviceAreaId);
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

// MED-N75 fix: required KYC document fields. Approval is refused
// if any of these is null on the providers row at the time of
// approval. Bug 1234 / NBI tracking depend on these being present.
const REQUIRED_KYC_FIELDS = [
  'nbi_clearance_url',
  'government_id_front_url',
  'government_id_back_url',
  'selfie_url',
] as const;

export interface ProviderApprovalReview {
  expectedRevisionId?: unknown;
  reason?: unknown;
  checklistConfirmed?: unknown;
  checklistSummary?: unknown;
}

export async function approveProvider(
  providerId: string,
  adminId: string,
  review: ProviderApprovalReview,
): Promise<void> {
  const reason = typeof review.reason === 'string' ? review.reason.trim() : '';
  if (reason.length < 10) {
    throw createAppError('Approval rationale must be at least 10 characters.', 400);
  }
  if (reason.length > 2000) {
    throw createAppError('Approval rationale must be ≤ 2000 characters.', 400);
  }
  if (review.checklistConfirmed !== true) {
    throw createAppError('The provider vetting checklist must be confirmed.', 400);
  }
  const checklistSummary = typeof review.checklistSummary === 'string'
    ? review.checklistSummary.trim()
    : '';
  if (checklistSummary.length < 20 || checklistSummary.length > 5000) {
    throw createAppError('A valid provider vetting checklist summary is required.', 400);
  }

  const expectedRevisionId = requireExpectedApplicationRevision(review.expectedRevisionId);
  await applicationDecisionTransaction(async (client) => {
    // OPS-479 / E36: validate the current complete evidence under the same
    // row lock as the decision. An unlocked read can approve after a concurrent
    // document removal. Existing approved records are not silently re-decided.
    const kyc = await client.query<{
      status: string;
      nbi_clearance_url: string | null;
      government_id_front_url: string | null;
      government_id_back_url: string | null;
      selfie_url: string | null;
    }>(
      `SELECT status, nbi_clearance_url, government_id_front_url,
              government_id_back_url, selfie_url
         FROM providers WHERE id = $1 FOR UPDATE`,
      [providerId],
    );
    const application = kyc.rows[0];
    if (!application || application.status !== 'pending') {
      throw createAppError('Provider not found or not in pending status.', 404);
    }
    await assertCurrentApplicationRevision(client, providerId, expectedRevisionId, application);
    const missing = REQUIRED_KYC_FIELDS.filter((field) => !application[field]?.trim());
    if (missing.length > 0) {
      throw createAppError(
        `Cannot approve: missing KYC documents (${missing.join(', ')}). Provider must upload before admin can approve.`,
        400,
      );
    }

    const result = await client.query<{ id: string; user_id: string }>(
      `UPDATE providers SET status = 'approved', reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, user_id`,
      [providerId],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not in pending status.', 404);

    const userId = result.rows[0]!.user_id;
    // OPS-480: approval is not an account-recovery or staff-role override.
    // The conditional UPDATE rechecks eligibility after any concurrent user
    // update and rolls back the provider decision if the owner is ineligible.
    // Older applicants prematurely assigned provider retain compatibility.
    const promoted = await client.query(
      `UPDATE users SET role = 'provider', updated_at = NOW()
        WHERE id = $1 AND role IN ('customer', 'provider')
          AND is_active = TRUE AND is_flagged_fraud = FALSE
        RETURNING id`,
      [userId],
    );
    if (promoted.rowCount !== 1) {
      throw createAppError(
        'Cannot approve: the application owner must be an active customer or legacy provider account with no fraud flag. Review the account separately.',
        409,
      );
    }

    await recordApplicationDecision(client, { providerId, revisionId: expectedRevisionId, adminId,
      decision: 'approved', reason, checklistSummary });
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'provider_approved', 'provider', $2, $3::jsonb, $4, $5)`,
      [
        adminId,
        providerId,
        JSON.stringify({ action: 'approved', revisionId: expectedRevisionId, checklistConfirmed: true, checklistSummary }),
        reason.slice(0, 500),
        `Approval rationale: ${reason}\n\n${checklistSummary}`,
      ],
    );

    // MED-N71 fix — pre-fix used type='tier_upgrade' which is the
    // notification type for suki tier promotions, not for first-
    // time provider account approval. Mobile clients route on
    // notification.type so the wrong type sent the user to the
    // wrong landing screen. Post-fix uses 'provider_approved' (now
    // in the NotificationType union per MED-N72) which mobile maps
    // to the dedicated approval screen.
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'provider_approved', 'Account Approved', 'Your provider account has been approved. Sign in again with your verified mobile number, then review your services, pricing and availability in your provider workspace before accepting work.', $2)`,
      [userId, JSON.stringify({ providerId, revisionId: expectedRevisionId })],
    );
  });

  logger.info('Provider approved', { providerId, adminId });
}

export async function rejectProvider(providerId: string, adminId: string, reason: string, revisionId?: unknown): Promise<void> {
  reason = reason.trim();
  if (reason.length < 10 || reason.length > 1000) throw createAppError('Rejection reason must be between 10 and 1000 characters.', 400);
  const expectedRevisionId = requireExpectedApplicationRevision(revisionId);
  await applicationDecisionTransaction(async (client) => {
    const locked = await client.query<{ status: string }>('SELECT status FROM providers WHERE id=$1 FOR UPDATE', [providerId]);
    if (locked.rows[0]?.status !== 'pending') throw createAppError('Provider not found or not in pending status.', 404);
    await assertCurrentApplicationRevision(client, providerId, expectedRevisionId);
    const result = await client.query<{ id: string; user_id: string }>(
      `UPDATE providers SET status = 'rejected', rejection_reason = $2, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, user_id`,
      [providerId, reason],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not in pending status.', 404);

    const userId = result.rows[0]!.user_id;
    // Repair accounts created by older releases that promoted applicants at
    // submission time. Never demote an admin or any other role here.
    await client.query(
      `UPDATE users SET role = 'customer', updated_at = NOW()
        WHERE id = $1 AND role = 'provider'`,
      [userId],
    );

    await recordApplicationDecision(client, { providerId, revisionId: expectedRevisionId, adminId, decision: 'rejected', reason });
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_rejected', 'provider', $2, $4::jsonb, $3)`,
      [adminId, providerId, reason, JSON.stringify({ action: 'rejected', revisionId: expectedRevisionId })],
    );

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'provider_rejected', 'Application Declined', $2, $3)`,
      [userId,
       `Your provider application has been declined. Reason: ${reason}. Please contact support for more information.`,
       JSON.stringify({ providerId, reason, revisionId: expectedRevisionId })],
    );
  });

  logger.info('Provider rejected', { providerId, adminId });
}

export async function suspendProvider(providerId: string, adminId: string, reason: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
    throw createAppError('Suspension reason must be between 10 and 1000 characters.', 400);
  }
  // MED-N73 fix: when a provider is suspended, in-flight bookings
  // (provider_en_route, provider_arrived, in_progress,
  // completed_by_provider) need to be flagged for admin review
  // before any further escrow release is allowed. We don't auto-
  // cancel (refunds need explicit admin choice) but we DO mark the
  // bookings with provider_suspended_during_booking_at so the
  // confirm/escrow paths can refuse to release until admin
  // resolves. Same transaction as the suspension itself so the
  // flag and the status flip are atomic.
  let flaggedCount = 0;
  await db.transaction(async (client) => {
    const result = await client.query<{ id: string; user_id: string }>(
      `UPDATE providers SET status = 'suspended', updated_at = NOW() WHERE id = $1 AND status = 'approved' RETURNING id, user_id`,
      [providerId],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not approved. Pending applications require application review.', 404);

    const ownerUserId = result.rows[0]!.user_id;
    await client.query(
      `UPDATE users
          SET session_version = session_version + 1,
              updated_at = NOW()
        WHERE id = $1`,
      [ownerUserId],
    );
    const revoked = await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [ownerUserId]);
    const revokedSessionCount = revoked.rowCount ?? 0;

    const flagged = await client.query<{ id: string }>(
      `UPDATE bookings
          SET provider_suspended_during_booking_at = NOW(),
              updated_at = NOW()
        WHERE provider_id = $1
          AND status IN ('provider_en_route', 'provider_arrived', 'in_progress', 'completed_by_provider')
          AND provider_suspended_during_booking_at IS NULL
        RETURNING id`,
      [providerId],
    );
    flaggedCount = flagged.rowCount ?? 0;

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_suspended', 'provider', $2, $3, $4)`,
      [
        adminId,
        providerId,
        JSON.stringify({
          action: 'suspended',
          inFlightBookingsFlagged: flaggedCount,
          revokedRefreshSessions: revokedSessionCount,
          allAccessCredentialsInvalidated: true,
        }),
        trimmedReason,
      ],
    );

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'provider_suspended', 'Provider account suspended', $2, $3::jsonb)`,
      [
        result.rows[0]!.user_id,
        `Your provider account has been suspended. Reason: ${trimmedReason}`,
        JSON.stringify({ providerId, reason: trimmedReason }),
      ],
    );
  });

  logger.info('Provider suspended', { providerId, adminId, inFlightBookingsFlagged: flaggedCount });
}

export async function reactivateProvider(providerId: string, adminId: string, reason: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
    throw createAppError('Reactivation reason must be between 10 and 1000 characters.', 400);
  }
  await db.transaction(async (client) => {
    // OPS-481: suspension/reactivation must never become an alternate initial
    // approval path. Historical rows without proof need explicit review, not
    // an inferred approval from a mutable status or account role alone.
    const suspended = await client.query<{ user_id: string; reviewed_at: Date | null }>(
      `SELECT user_id, reviewed_at FROM providers WHERE id = $1 AND status = 'suspended' FOR UPDATE`,
      [providerId],
    );
    const provider = suspended.rows[0];
    if (!provider) throw createAppError('Provider not found or not suspended.', 404);
    const admission = await client.query<{ was_approved: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM admin_actions
         WHERE target_type = 'provider' AND target_id = $1 AND action_type = 'provider_approved'
       ) AS was_approved`,
      [providerId],
    );
    if (!provider.reviewed_at || admission.rows[0]?.was_approved !== true) {
      throw createAppError('Reactivation requires a recorded prior provider approval. This application needs a separate admission review; reactivation cannot approve it.', 409);
    }
    // Lock the current account through commit without changing its role,
    // fraud flag, activation or session generation.
    const owner = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND role = 'provider'
         AND is_active = TRUE AND is_flagged_fraud = FALSE FOR SHARE`,
      [provider.user_id],
    );
    if (owner.rowCount !== 1) {
      throw createAppError('Reactivation requires an active provider account without a fraud flag. Review the account separately; reactivation cannot override its access controls.', 409);
    }
    const result = await client.query<{ id: string; user_id: string }>(
      `UPDATE providers SET status = 'approved', updated_at = NOW() WHERE id = $1 AND status = 'suspended' RETURNING id, user_id`,
      [providerId],
    );
    if (result.rowCount === 0) throw createAppError('Provider not found or not suspended.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'provider_reactivated', 'provider', $2, '{"action":"reactivated"}'::jsonb, $3, $4)`,
      [adminId, providerId, trimmedReason.slice(0, 500), trimmedReason],
    );

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'provider_reactivated', 'Provider account reactivated', $2, $3::jsonb)`,
      [
        result.rows[0]!.user_id,
        `Your provider account has been reactivated. Reason: ${trimmedReason}`,
        JSON.stringify({ providerId, reason: trimmedReason }),
      ],
    );
  });

  logger.info('Provider reactivated', { providerId, adminId });
}

// MED-N74 fix: tier whitelist matches migration 073 CHECK constraint
// (founding | new | verified | pro | elite). Without this guard, an
// admin could pass any string to changeProviderTier and the UPDATE
// would either succeed (writing a value the rest of the code can't
// interpret) or raise an opaque DB CHECK error. Whitelist gives a
// clean 400 with the allowed values listed.
const ALLOWED_TIERS = new Set<string>(['founding', 'new', 'verified', 'pro', 'elite']);

export async function changeProviderTier(
  providerId: string,
  adminId: string,
  newTier: string,
  reason: string,
): Promise<void> {
  if (!ALLOWED_TIERS.has(newTier)) {
    throw createAppError(
      `Invalid tier "${newTier}". Allowed: ${Array.from(ALLOWED_TIERS).join(', ')}.`,
      400,
    );
  }
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
  filters: { search?: string; status?: string; sort?: string; page: number; pageSize: number },
): Promise<{ customers: CustomerAdminRow[]; total: number; summary: CustomerQueueSummary }> {
  const conditions: string[] = [`u.role = 'customer'`];
  const params: unknown[] = [];
  let paramIdx = 1;

  const allowedStatuses = new Set(['active', 'inactive', 'flag_fraud']);
  if (filters.status && !allowedStatuses.has(filters.status)) {
    throw createAppError('Invalid customer status. Allowed: active, inactive, flag_fraud.', 400);
  }
  const sort = filters.sort ?? 'attention';
  const allowedSorts = new Set(['attention', 'newest', 'active_work', 'completed_value']);
  if (!allowedSorts.has(sort)) {
    throw createAppError('Invalid customer sort. Allowed: attention, newest, active_work, completed_value.', 400);
  }

  if (filters.search) {
    conditions.push(`(
      CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${paramIdx}
      OR u.phone ILIKE $${paramIdx}
      OR COALESCE(u.email, '') ILIKE $${paramIdx}
      OR u.id::text ILIKE $${paramIdx}
    )`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }
  if (filters.status) {
    if (filters.status === 'flag_fraud') {
      conditions.push(`u.is_flagged_fraud = TRUE`);
    } else if (filters.status === 'active') {
      conditions.push(`u.is_active = TRUE`);
    } else if (filters.status === 'inactive') {
      conditions.push(`u.is_active = FALSE`);
    }
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const offset = (filters.page - 1) * filters.pageSize;
  const activeBookingStatuses = ACTIVE_BOOKING_STATUSES.map((status) => `'${status}'`).join(', ');
  const completedBookingStatuses = COMPLETED_BOOKING_STATUSES.map((status) => `'${status}'`).join(', ');
  const openSupportCountSql = `(SELECT COUNT(*) FROM support_tickets st WHERE st.user_id = u.id AND st.status NOT IN ('resolved', 'closed'))`;
  const openDisputeCountSql = `(SELECT COUNT(*) FROM disputes d JOIN bookings b ON b.id = d.booking_id WHERE b.customer_id = u.id AND d.status IN ('open', 'under_review', 'escalated'))`;
  const activeBookingCountSql = `(SELECT COUNT(*) FROM bookings b WHERE b.customer_id = u.id AND b.status IN (${activeBookingStatuses}))`;
  const completedValueSql = `COALESCE((SELECT SUM(b.total_amount) FROM bookings b WHERE b.customer_id = u.id AND b.status IN (${completedBookingStatuses})), 0)`;
  const orderClause = sort === 'newest'
    ? 'u.created_at DESC'
    : sort === 'active_work'
      ? `${activeBookingCountSql} DESC, u.created_at DESC`
      : sort === 'completed_value'
        ? `${completedValueSql} DESC, u.created_at DESC`
        : `u.is_flagged_fraud DESC, ${openSupportCountSql} DESC, ${openDisputeCountSql} DESC, ${activeBookingCountSql} DESC, u.created_at DESC`;

  const [countResult, summaryResult, dataResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM users u ${whereClause}`,
      params,
    ),
    db.query<CustomerQueueSummaryRow>(
      `SELECT COUNT(*)::text AS total_customers,
              COUNT(*) FILTER (WHERE is_active = TRUE)::text AS active_accounts,
              COUNT(*) FILTER (WHERE is_active = FALSE)::text AS inactive_accounts,
              COUNT(*) FILTER (WHERE is_flagged_fraud = TRUE)::text AS fraud_flagged
         FROM users
        WHERE role = 'customer'`,
    ),
    db.query<CustomerAdminRow>(
      `SELECT u.id, u.phone, u.email, u.first_name, u.last_name, u.role, u.is_active, u.is_flagged_fraud, u.created_at, u.updated_at,
         (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = u.id)::text AS total_bookings,
         ${completedValueSql}::text AS total_spent,
         ${activeBookingCountSql}::text AS active_bookings,
         (SELECT COUNT(*) FROM disputes d JOIN bookings b ON b.id = d.booking_id WHERE b.customer_id = u.id)::text AS total_disputes,
         ${openDisputeCountSql}::text AS open_disputes,
         ${openSupportCountSql}::text AS open_support_tickets
       FROM users u
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, filters.pageSize, offset],
    ),
  ]);

  const summaryRow = summaryResult.rows[0];
  return {
    customers: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    summary: {
      totalCustomers: Number(summaryRow?.total_customers ?? 0),
      activeAccounts: Number(summaryRow?.active_accounts ?? 0),
      inactiveAccounts: Number(summaryRow?.inactive_accounts ?? 0),
      fraudFlagged: Number(summaryRow?.fraud_flagged ?? 0),
    },
  };
}

export async function listBookingsAdmin(
  filters: {
    status?: string;
    search?: string;
    view?: string;
    sort?: string;
    businessAccountId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ bookings: BookingAdminRow[]; total: number; summary: BookingQueueSummary }> {
  const queueViews = new Set(['all', 'active', 'unassigned', 'support', 'disputed', 'past_scheduled']);
  const queueSorts = new Set(['attention', 'newest', 'scheduled', 'highest_value']);
  const view = filters.view ?? 'all';
  const sort = filters.sort ?? 'newest';

  if (filters.status && filters.status !== 'active' && !ALL_BOOKING_STATUSES.includes(filters.status as never)) {
    throw createAppError('Invalid booking status filter.', 400);
  }
  if (filters.businessAccountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.businessAccountId)) {
    throw createAppError('Invalid business account filter.', 400);
  }
  if (!queueViews.has(view)) throw createAppError('Invalid booking queue view.', 400);
  if (!queueSorts.has(sort)) throw createAppError('Invalid booking queue sort.', 400);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;
  const activeStatusesSql = ACTIVE_BOOKING_STATUSES.map((status) => `'${status}'`).join(', ');
  const openSupportSql = `EXISTS (
    SELECT 1 FROM support_tickets st
    WHERE st.booking_id = b.id AND st.status NOT IN ('resolved', 'closed')
  )`;
  const openDisputeSql = `EXISTS (
    SELECT 1 FROM disputes d
    WHERE d.booking_id = b.id AND d.status IN ('open', 'under_review', 'escalated')
  )`;
  // E33: E03's approved instant-pay contract makes only a verified paid
  // unmatched booking an assignment exception. Requested/quoted/payment-pending
  // bookings must not be promoted as ready for provider assignment.
  const assignmentAttentionSql = `b.provider_id IS NULL AND b.status = 'paid'`;

  if (filters.businessAccountId) {
    conditions.push(`b.business_account_id = $${paramIdx++}`);
    params.push(filters.businessAccountId);
  }

  if (filters.status) {
    // Phase 200 fix — "active" is a logical bucket, not a stored status.
    // The dispatch console requests ?status=active expecting every live
    // booking; pre-fix the literal `b.status = 'active'` matched zero rows
    // (no booking is ever stored with status 'active'), so the dispatch
    // table, counters, and map were always empty. Expand the bucket to the
    // canonical ACTIVE_BOOKING_STATUSES set; all other values stay exact.
    if (filters.status === 'active') {
      const placeholders = ACTIVE_BOOKING_STATUSES.map(() => `$${paramIdx++}`).join(', ');
      conditions.push(`b.status IN (${placeholders})`);
      params.push(...ACTIVE_BOOKING_STATUSES);
    } else {
      conditions.push(`b.status = $${paramIdx++}`);
      params.push(filters.status);
    }
  }
  if (filters.search) {
    // Operator searches use two different matching expectations: names and
    // labels should find a term anywhere, while UUIDs should match from the
    // beginning so a copied ID prefix does not surface unrelated records that
    // happen to contain the same characters in the middle.
    const broadSearchParam = paramIdx;
    const identifierPrefixParam = paramIdx + 1;
    conditions.push(`(
      b.id::text ILIKE $${identifierPrefixParam}
      OR b.customer_id::text ILIKE $${identifierPrefixParam}
      OR COALESCE(b.provider_id::text, '') ILIKE $${identifierPrefixParam}
      OR COALESCE(b.city, '') ILIKE $${broadSearchParam}
      OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $${broadSearchParam}
      OR u.phone ILIKE $${broadSearchParam}
      OR COALESCE(u.email, '') ILIKE $${broadSearchParam}
      OR COALESCE(p.business_name, '') ILIKE $${broadSearchParam}
      OR CONCAT_WS(' ', pu.first_name, pu.last_name) ILIKE $${broadSearchParam}
      OR COALESCE(pu.phone, '') ILIKE $${broadSearchParam}
      OR COALESCE(ss.name, '') ILIKE $${broadSearchParam}
      OR COALESCE(sc.name, '') ILIKE $${broadSearchParam}
      OR COALESCE(ba.company_name, '') ILIKE $${broadSearchParam}
      OR COALESCE(latest_invoice.invoice_number, '') ILIKE $${broadSearchParam}
    )`);
    params.push(`%${filters.search}%`, `${filters.search}%`);
    paramIdx += 2;
  }

  if (view === 'active') {
    conditions.push(`b.status IN (${activeStatusesSql})`);
  } else if (view === 'unassigned') {
    conditions.push(assignmentAttentionSql);
  } else if (view === 'support') {
    conditions.push(openSupportSql);
  } else if (view === 'disputed') {
    conditions.push(`(b.status = 'disputed' OR ${openDisputeSql})`);
  } else if (view === 'past_scheduled') {
    conditions.push(`b.scheduled_at < NOW() AND b.status IN (${activeStatusesSql})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const bookingListJoins = `
    FROM bookings b
    JOIN users u ON u.id = b.customer_id
    LEFT JOIN providers p ON p.id = b.provider_id
    LEFT JOIN users pu ON pu.id = p.user_id
    LEFT JOIN service_subcategories ss ON ss.id = b.subcategory_id
    LEFT JOIN service_categories sc ON sc.id = b.category_id
    LEFT JOIN business_accounts ba ON ba.id = b.business_account_id
    LEFT JOIN business_contracts bc ON bc.id = b.contract_id
    LEFT JOIN LATERAL (
      SELECT bi.id, bi.invoice_number, bi.status
        FROM business_invoice_items bii
        JOIN business_invoices bi ON bi.id = bii.invoice_id
       WHERE bii.booking_id = b.id
       ORDER BY bi.billing_period_end DESC, bi.created_at DESC, bi.id DESC
       LIMIT 1
    ) latest_invoice ON TRUE`;

  const openSupportCountSql = `(SELECT COUNT(*) FROM support_tickets st WHERE st.booking_id = b.id AND st.status NOT IN ('resolved', 'closed'))`;
  const unassignedSupportCountSql = `(SELECT COUNT(*) FROM support_tickets st WHERE st.booking_id = b.id AND st.status NOT IN ('resolved', 'closed') AND st.assigned_agent_id IS NULL)`;
  const urgentSupportCountSql = `(SELECT COUNT(*) FROM support_tickets st WHERE st.booking_id = b.id AND st.status NOT IN ('resolved', 'closed') AND st.priority = 'urgent')`;
  const openDisputeCountSql = `(SELECT COUNT(*) FROM disputes d WHERE d.booking_id = b.id AND d.status IN ('open', 'under_review', 'escalated'))`;
  const orderClause = sort === 'attention'
    ? `${urgentSupportCountSql} DESC, ${unassignedSupportCountSql} DESC, ${openDisputeCountSql} DESC, CASE WHEN ${assignmentAttentionSql} THEN 1 ELSE 0 END DESC, CASE WHEN b.scheduled_at < NOW() AND b.status IN (${activeStatusesSql}) THEN 1 ELSE 0 END DESC, ${openSupportCountSql} DESC, b.scheduled_at ASC NULLS LAST, b.created_at DESC`
    : sort === 'scheduled'
      ? 'b.scheduled_at ASC NULLS LAST, b.created_at DESC'
      : sort === 'highest_value'
        ? 'b.total_amount DESC, b.created_at DESC'
        : 'b.created_at DESC';

  const [countResult, summaryResult] = await Promise.all([
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count ${bookingListJoins} ${whereClause}`,
      params,
    ),
    db.query<BookingQueueSummaryRow>(
      `SELECT COUNT(*)::text AS total_bookings,
              COUNT(*) FILTER (WHERE b.status IN (${activeStatusesSql}))::text AS active_bookings,
              COUNT(*) FILTER (WHERE ${assignmentAttentionSql})::text AS unassigned_active,
              COUNT(*) FILTER (WHERE ${openSupportSql})::text AS open_support_bookings,
              COUNT(*) FILTER (WHERE b.status = 'disputed' OR ${openDisputeSql})::text AS disputed_bookings,
              COUNT(*) FILTER (WHERE b.scheduled_at < NOW() AND b.status IN (${activeStatusesSql}))::text AS past_scheduled_bookings
         FROM bookings b
         ${filters.businessAccountId ? 'WHERE b.business_account_id = $1' : ''}`,
      filters.businessAccountId ? [filters.businessAccountId] : [],
    ),
  ]);

  const offset = (filters.page - 1) * filters.pageSize;
  const dataResult = await db.query<BookingAdminRow>(
    `SELECT b.id, b.customer_id, b.provider_id, b.category_id, b.booking_type,
       b.business_account_id, ba.company_name AS business_account_name,
       b.contract_id, bc.contract_type,
       latest_invoice.id AS invoice_id,
       latest_invoice.invoice_number,
       latest_invoice.status AS invoice_status,
       b.status,
       b.escrow_status, b.total_amount::text, b.city, b.scheduled_at, b.created_at,
       b.latitude::text AS latitude, b.longitude::text AS longitude,
       CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
       p.business_name AS provider_name,
       COALESCE(ss.name, sc.name) AS category_name,
       ${openSupportCountSql}::text AS open_support_tickets,
       ${unassignedSupportCountSql}::text AS unassigned_support_tickets,
       ${urgentSupportCountSql}::text AS urgent_support_tickets,
       (SELECT STRING_AGG(support_owner.owner_name, ', ' ORDER BY support_owner.owner_name)
          FROM (
            SELECT DISTINCT NULLIF(BTRIM(CONCAT_WS(' ', au.first_name, au.last_name)), '') AS owner_name
              FROM support_tickets st
              JOIN users au ON au.id = st.assigned_agent_id
             WHERE st.booking_id = b.id AND st.status NOT IN ('resolved', 'closed')
          ) support_owner
         WHERE support_owner.owner_name IS NOT NULL) AS support_owner_names,
       ${openDisputeCountSql}::text AS open_disputes,
       (b.scheduled_at < NOW() AND b.status IN (${activeStatusesSql})) AS past_scheduled
     ${bookingListJoins}
     ${whereClause}
     ORDER BY ${orderClause}
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  const summary = summaryResult.rows[0];
  return {
    bookings: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    summary: {
      totalBookings: Number(summary?.total_bookings ?? 0),
      activeBookings: Number(summary?.active_bookings ?? 0),
      unassignedActive: Number(summary?.unassigned_active ?? 0),
      openSupportBookings: Number(summary?.open_support_bookings ?? 0),
      disputedBookings: Number(summary?.disputed_bookings ?? 0),
      pastScheduledBookings: Number(summary?.past_scheduled_bookings ?? 0),
    },
  };
}

/**
 * MED-N76 fix — replace dynamic SQL string interpolation with a
 * static-fragment switch. The pre-fix code interpolated `truncUnit`
 * (a whitelisted value) into the SQL string. The interpolation was
 * SQL-safe since `truncUnit` came from a closed enum, but the
 * pattern itself is a "looks-like-injection" footgun: a future
 * refactor that widens the period type would silently break the
 * whitelist. Switching to a static-string lookup makes the dynamic
 * fragment provably static at compile time.
 */
type TruncFragment = "date_trunc('day', wt.created_at)" | "date_trunc('week', wt.created_at)" | "date_trunc('month', wt.created_at)";

function truncFragmentForPeriod(period: 'daily' | 'weekly' | 'monthly'): TruncFragment {
  switch (period) {
    case 'daily':
      return "date_trunc('day', wt.created_at)";
    case 'weekly':
      return "date_trunc('week', wt.created_at)";
    case 'monthly':
      return "date_trunc('month', wt.created_at)";
  }
}

export async function getRevenueReport(
  period: 'daily' | 'weekly' | 'monthly',
  days = 30,
): Promise<RevenueRow[]> {
  const trunc: string = truncFragmentForPeriod(period);

  const result = await db.query<RevenueRow>(
    `SELECT
       ${trunc}::date::text AS date,
       COALESCE(SUM(CASE WHEN wt.type = 'commission' THEN wt.amount ELSE 0 END), 0)::text AS total_commission,
       COALESCE(SUM(CASE WHEN wt.type = 'service_fee' THEN wt.amount ELSE 0 END), 0)::text AS total_service_fees,
       COALESCE(SUM(CASE WHEN wt.type = 'refund' AND wt.amount < 0 THEN -wt.amount ELSE 0 END), 0)::text AS total_refunds,
       COUNT(DISTINCT wt.booking_id)::text AS booking_count
     FROM wallet_transactions wt
     WHERE wt.created_at >= NOW() - make_interval(days => $1)
       AND wt.type IN ('commission', 'service_fee', 'refund')
     GROUP BY ${trunc}
     ORDER BY date ASC`,
    [days],
  );

  return result.rows;
}

export async function getAdminActions(
  filters: { adminId?: string; actionType?: string; page: number; pageSize: number },
  _viewerRole?: string,
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
    `SELECT a.id, a.admin_id, a.action_type, a.target_type, a.target_id,
            a.details, a.reason, a.created_at
       FROM admin_actions a ${whereClause} ORDER BY a.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, filters.pageSize, offset],
  );

  // SEC-071 / E72: this legacy list is an audit index, not a bulk reveal.
  // Match the general Audit Log's masking for EVERY role, including super
  // admin. D25's record-scoped operational contact policy is unchanged.
  // Explicitly project fields so historical/full_notes or future DB columns
  // cannot leak through a SELECT * / object-spread compatibility path.
  const masked = dataResult.rows.map((row): AdminActionRow => ({
    id: row.id,
    admin_id: row.admin_id,
    action_type: row.action_type,
    target_type: row.target_type,
    target_id: row.target_id,
    details: maskPiiForRole({ details: row.details }, 'admin').details,
    reason: row.reason === null ? null : maskPiiInString(row.reason),
    created_at: row.created_at,
  }));

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
    // Phase 200 — surfaced for the dispatch map. Number() on a null stays
    // null; pg returns DECIMAL as a string so coerce when present.
    latitude: p.latitude != null ? Number(p.latitude) : null,
    longitude: p.longitude != null ? Number(p.longitude) : null,
    phone: p.phone,
    email: p.email,
    fullName: p.full_name,
    createdAt: p.created_at,
  };
}

export function formatCustomer(
  c: CustomerAdminRow,
  actorRole: ActorRole = 'admin',
): Record<string, unknown> {
  const contactMasked = actorRole !== 'super_admin';
  return {
    id: c.id,
    phone: contactMasked ? maskPhilippinePhone(c.phone) : c.phone,
    email: contactMasked ? (c.email ? maskEmail(c.email) : null) : c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    status: c.is_flagged_fraud ? 'flag_fraud' : (c.is_active ? 'active' : 'inactive'),
    isActive: c.is_active,
    isFlaggedFraud: c.is_flagged_fraud,
    contactMasked,
    totalBookings: Number(c.total_bookings),
    totalSpent: Number(c.total_spent),
    activeBookings: Number(c.active_bookings),
    totalDisputes: Number(c.total_disputes),
    openDisputes: Number(c.open_disputes),
    openSupportTickets: Number(c.open_support_tickets),
    createdAt: c.created_at,
  };
}

export function formatBookingAdmin(b: BookingAdminRow): Record<string, unknown> {
  return {
    id: b.id,
    customerId: b.customer_id,
    providerId: b.provider_id,
    categoryId: b.category_id,
    bookingType: b.booking_type,
    businessAccountId: b.business_account_id,
    businessAccountName: b.business_account_name,
    contractId: b.contract_id,
    contractType: b.contract_type,
    invoiceId: b.invoice_id,
    invoiceNumber: b.invoice_number,
    invoiceStatus: b.invoice_status,
    status: b.status,
    escrowStatus: b.escrow_status,
    totalAmount: Number(b.total_amount),
    city: b.city,
    scheduledAt: b.scheduled_at,
    customerName: b.customer_name,
    providerName: b.provider_name,
    categoryName: b.category_name,
    createdAt: b.created_at,
    // Phase 200 — surfaced for the dispatch map.
    latitude: b.latitude != null ? Number(b.latitude) : null,
    longitude: b.longitude != null ? Number(b.longitude) : null,
    openSupportTickets: Number(b.open_support_tickets ?? 0),
    unassignedSupportTickets: Number(b.unassigned_support_tickets ?? 0),
    urgentSupportTickets: Number(b.urgent_support_tickets ?? 0),
    supportOwnerNames: b.support_owner_names ?? null,
    openDisputes: Number(b.open_disputes ?? 0),
    pastScheduled: Boolean(b.past_scheduled),
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
