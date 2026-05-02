/**
 * Phase 06 — Customer 360 admin service.
 * Read + write actions for the admin Customer Detail page (6 tabs).
 *
 * Sacred-file note: this service touches wallet balances via
 * `creditCustomerWallet` (super-admin manual credit). That single function is
 * gated by super-admin role + always writes a paired wallet_transaction
 * within a transaction so money conservation holds. All other functions are
 * read-only or write to users.is_active / admin_actions only.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as settingsService from './settings.service';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  lifetimeBookings: number;
  lifetimeSpent: number;
  averageRatingGiven: number | null;
  totalReviewsGiven: number;
  addresses: {
    id: string;
    label: string;
    fullAddress: string;
    barangay: string;
    city: string;
    province: string;
    isDefault: boolean;
  }[];
  sukiProviders: {
    membershipId: string;
    providerId: string;
    providerBusinessName: string;
    tier: string;
    totalBookings: number;
    totalSpent: number;
    pointsBalance: number;
    lastBookingAt: string | null;
  }[];
}

export interface CustomerBookingRow {
  id: string;
  providerId: string | null;
  providerBusinessName: string | null;
  categoryName: string;
  status: string;
  totalAmount: number;
  scheduledAt: string;
  completedAt: string | null;
  ratingGiven: number | null;
  hasDispute: boolean;
}

export interface CustomerBookingsResult {
  rows: CustomerBookingRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerPayments {
  walletAvailable: number;
  walletPending: number;
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string;
    bookingId: string | null;
    createdAt: string;
  }[];
  recentPaymentIntents: {
    id: string;
    bookingId: string;
    paymentMethod: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
  paymentMethodCounts: Record<string, number>;
}

export interface CustomerDispute {
  id: string;
  bookingId: string;
  providerBusinessName: string | null;
  type: string;
  status: string;
  resolutionType: string | null;
  refundAmount: number;
  createdAt: string;
}

export interface CustomerDisputesResult {
  rows: CustomerDispute[];
  fraudPattern: {
    disputesLast30Days: number;
    favorProviderRate: number | null;
    flagged: boolean;
    reason: string | null;
  };
}

export interface CustomerReferralsResult {
  ownCodes: {
    id: string;
    code: string;
    type: string;
    usesCount: number;
    maxUses: number | null;
    referrerBonus: number;
    refereeBonus: number;
    isActive: boolean;
    expiresAt: string | null;
  }[];
  given: {
    id: string;
    refereeId: string;
    refereeName: string;
    refereeBonus: number;
    referrerBonus: number;
    referrerCredited: boolean;
    qualifyingBookingId: string | null;
    createdAt: string;
  }[];
  received: {
    id: string;
    referrerId: string;
    referrerName: string;
    refereeBonus: number;
    refereeCredited: boolean;
    createdAt: string;
  } | null;
  totalEarnedFromReferrals: number;
}

export interface CustomerActivityRow {
  id: string;
  source: 'audit' | 'login' | 'admin_action';
  action: string;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface WalletCreditResult {
  walletId: string;
  newAvailableBalance: number;
  transactionId: string;
}

export type CustomerStatusAction = 'suspend' | 'reactivate' | 'flag_fraud';

// ─────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────

export async function getCustomerProfile(customerId: string): Promise<CustomerProfile> {
  const userResult = await db.query<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_active: boolean;
    last_login_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, first_name, last_name, phone, email, avatar_url,
            is_verified, is_active, last_login_at, created_at
       FROM users
      WHERE id = $1 AND role = 'customer'`,
    [customerId],
  );
  const u = userResult.rows[0];
  if (!u) throw createAppError('Customer not found.', 404);

  const [stats, addresses, suki] = await Promise.all([
    db.query<{
      lifetime_bookings: string;
      lifetime_spent: string;
      avg_rating: string | null;
      total_reviews: string;
    }>(
      `SELECT
         COUNT(b.id)::text AS lifetime_bookings,
         COALESCE(SUM(CASE WHEN b.status = 'confirmed' OR b.status = 'paid_out' THEN b.total_amount ELSE 0 END), 0)::text AS lifetime_spent,
         (SELECT AVG(rating)::text FROM reviews WHERE reviewer_id = $1) AS avg_rating,
         (SELECT COUNT(*)::text FROM reviews WHERE reviewer_id = $1) AS total_reviews
         FROM bookings b
        WHERE b.customer_id = $1`,
      [customerId],
    ),
    db.query<{
      id: string;
      label: string;
      full_address: string;
      barangay: string;
      city: string;
      province: string;
      is_default: boolean;
    }>(
      `SELECT id, label, full_address, barangay, city, province, is_default
         FROM user_addresses
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at DESC
        LIMIT 50`,
      [customerId],
    ),
    db.query<{
      membership_id: string;
      provider_id: string;
      business_name: string;
      tier: string;
      total_bookings: number;
      total_spent: string;
      points_balance: number;
      last_booking_at: Date | null;
    }>(
      `SELECT sm.id AS membership_id,
              sm.provider_id,
              p.business_name,
              sm.tier,
              sm.total_bookings,
              sm.total_spent::text AS total_spent,
              sm.points_balance,
              sm.last_booking_at
         FROM suki_memberships sm
         JOIN providers p ON p.id = sm.provider_id
        WHERE sm.customer_id = $1
        ORDER BY sm.total_bookings DESC
        LIMIT 50`,
      [customerId],
    ),
  ]);

  const s = stats.rows[0];
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    fullName: `${u.first_name} ${u.last_name}`.trim(),
    phone: u.phone,
    email: u.email,
    avatarUrl: u.avatar_url,
    isVerified: u.is_verified,
    isActive: u.is_active,
    lastLoginAt: u.last_login_at ? u.last_login_at.toISOString() : null,
    createdAt: u.created_at.toISOString(),
    lifetimeBookings: Number(s?.lifetime_bookings ?? 0),
    lifetimeSpent: Number(s?.lifetime_spent ?? 0),
    averageRatingGiven: s?.avg_rating ? Number(s.avg_rating) : null,
    totalReviewsGiven: Number(s?.total_reviews ?? 0),
    addresses: addresses.rows.map((r) => ({
      id: r.id,
      label: r.label,
      fullAddress: r.full_address,
      barangay: r.barangay,
      city: r.city,
      province: r.province,
      isDefault: r.is_default,
    })),
    sukiProviders: suki.rows.map((r) => ({
      membershipId: r.membership_id,
      providerId: r.provider_id,
      providerBusinessName: r.business_name,
      tier: r.tier,
      totalBookings: r.total_bookings,
      totalSpent: Number(r.total_spent),
      pointsBalance: r.points_balance,
      lastBookingAt: r.last_booking_at ? r.last_booking_at.toISOString() : null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// Bookings
// ─────────────────────────────────────────────────────────────────

export async function getCustomerBookings(
  customerId: string,
  page: number,
  pageSize: number,
  status?: string,
): Promise<CustomerBookingsResult> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const params: unknown[] = [customerId];
  let where = 'WHERE b.customer_id = $1';
  if (status) {
    params.push(status);
    where += ` AND b.status = $${params.length}`;
  }

  const totalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM bookings b ${where}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  params.push(safePageSize);
  params.push(offset);
  const rowsResult = await db.query<{
    id: string;
    provider_id: string | null;
    business_name: string | null;
    category_name: string;
    status: string;
    total_amount: number;
    scheduled_at: Date;
    completed_at: Date | null;
    rating_given: number | null;
    has_dispute: boolean;
  }>(
    `SELECT b.id, b.provider_id,
            p.business_name,
            sc.name AS category_name,
            b.status, b.total_amount,
            b.scheduled_at, b.completed_at,
            r.rating AS rating_given,
            EXISTS (SELECT 1 FROM disputes d WHERE d.booking_id = b.id) AS has_dispute
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN reviews r ON r.booking_id = b.id AND r.reviewer_id = b.customer_id
       ${where}
      ORDER BY b.scheduled_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rowsResult.rows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      providerBusinessName: r.business_name,
      categoryName: r.category_name ?? 'Uncategorized',
      status: r.status,
      totalAmount: r.total_amount,
      scheduledAt: r.scheduled_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      ratingGiven: r.rating_given,
      hasDispute: r.has_dispute,
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

// ─────────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────────

export async function getCustomerPayments(customerId: string): Promise<CustomerPayments> {
  const [walletRow, txRow, intentRow, methodCounts] = await Promise.all([
    db.query<{ available: string; pending: string }>(
      `SELECT COALESCE(available_balance, 0)::text AS available,
              COALESCE(pending_balance, 0)::text AS pending
         FROM wallets
        WHERE user_id = $1 AND type = 'customer'`,
      [customerId],
    ),
    db.query<{
      id: string;
      type: string;
      amount: number;
      balance_after: number;
      description: string;
      booking_id: string | null;
      created_at: Date;
    }>(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.description,
              wt.booking_id, wt.created_at
         FROM wallet_transactions wt
         JOIN wallets w ON w.id = wt.wallet_id
        WHERE w.user_id = $1 AND w.type = 'customer'
        ORDER BY wt.created_at DESC
        LIMIT 50`,
      [customerId],
    ),
    db.query<{
      id: string;
      booking_id: string;
      payment_method: string;
      status: string;
      amount: number;
      created_at: Date;
    }>(
      `SELECT pi.id, pi.booking_id, pi.payment_method, pi.status, pi.amount, pi.created_at
         FROM payment_intents pi
         JOIN bookings b ON b.id = pi.booking_id
        WHERE b.customer_id = $1
        ORDER BY pi.created_at DESC
        LIMIT 50`,
      [customerId],
    ),
    db.query<{ payment_method: string; count: string }>(
      `SELECT pi.payment_method, COUNT(*)::text AS count
         FROM payment_intents pi
         JOIN bookings b ON b.id = pi.booking_id
        WHERE b.customer_id = $1 AND pi.status = 'succeeded'
        GROUP BY pi.payment_method`,
      [customerId],
    ),
  ]);

  const counts: Record<string, number> = {};
  for (const r of methodCounts.rows) counts[r.payment_method] = Number(r.count);

  return {
    walletAvailable: Number(walletRow.rows[0]?.available ?? 0),
    walletPending: Number(walletRow.rows[0]?.pending ?? 0),
    recentTransactions: txRow.rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      balanceAfter: r.balance_after,
      description: r.description,
      bookingId: r.booking_id,
      createdAt: r.created_at.toISOString(),
    })),
    recentPaymentIntents: intentRow.rows.map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
      paymentMethod: r.payment_method,
      status: r.status,
      amount: r.amount,
      createdAt: r.created_at.toISOString(),
    })),
    paymentMethodCounts: counts,
  };
}

// ─────────────────────────────────────────────────────────────────
// Disputes (with fraud-pattern detection)
// ─────────────────────────────────────────────────────────────────

export async function getCustomerDisputes(customerId: string): Promise<CustomerDisputesResult> {
  const result = await db.query<{
    id: string;
    booking_id: string;
    business_name: string | null;
    type: string;
    status: string;
    resolution_type: string | null;
    refund_amount: number | null;
    created_at: Date;
  }>(
    `SELECT d.id, d.booking_id,
            p.business_name,
            d.type, d.status, d.resolution_type,
            COALESCE(d.refund_amount, 0) AS refund_amount,
            d.created_at
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE d.filed_by = $1
      ORDER BY d.created_at DESC
      LIMIT 200`,
    [customerId],
  );

  const rows = result.rows.map<CustomerDispute>((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    providerBusinessName: r.business_name,
    type: r.type,
    status: r.status,
    resolutionType: r.resolution_type,
    refundAmount: Number(r.refund_amount ?? 0),
    createdAt: r.created_at.toISOString(),
  }));

  // MED-N16 fix: fraud-pattern thresholds are now admin-tunable.
  // Pre-fix: hardcoded 5 disputes / 30 days / 80% threshold. Ops
  // couldn't adjust as real-world dispute patterns revealed
  // themselves. Now: read from platform_settings (defaults match
  // the original constants).
  let countThreshold = 5;
  let windowDays = 30;
  let favorRateThreshold = 0.80;
  try {
    countThreshold = await settingsService.getSettingInteger('fraud_pattern_dispute_count_threshold');
    windowDays = await settingsService.getSettingInteger('fraud_pattern_window_days');
    favorRateThreshold = Number(await settingsService.getSetting('fraud_pattern_favor_provider_rate'));
    if (!Number.isFinite(favorRateThreshold)) favorRateThreshold = 0.80;
  } catch (err) {
    logger.warn('Fraud-pattern threshold settings unreadable; using built-in defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const now = Date.now();
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const recent = rows.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  const resolved = recent.filter((r) => r.status === 'resolved');
  const favorProvider = resolved.filter(
    (r) => r.resolutionType === 'no_refund' || r.resolutionType === 'refund_with_warning' || r.resolutionType === 'refund_with_suspension',
  ).length;
  const favorProviderRate = resolved.length > 0 ? favorProvider / resolved.length : null;
  const flagged = recent.length >= countThreshold && favorProviderRate !== null && favorProviderRate >= favorRateThreshold;
  let reason: string | null = null;
  if (flagged) {
    const pct = Math.round((favorProviderRate ?? 0) * 100);
    reason = `Filed ${recent.length} disputes in ${windowDays} days; ${pct}% resolved in favor of provider — possible fraudulent pattern.`;
  }

  return {
    rows,
    fraudPattern: {
      disputesLast30Days: recent.length,
      favorProviderRate,
      flagged,
      reason,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Referrals
// ─────────────────────────────────────────────────────────────────

export async function getCustomerReferrals(customerId: string): Promise<CustomerReferralsResult> {
  const [codesResult, givenResult, receivedResult] = await Promise.all([
    db.query<{
      id: string;
      code: string;
      type: string;
      uses_count: number;
      max_uses: number | null;
      referrer_bonus: number;
      referee_bonus: number;
      is_active: boolean;
      expires_at: Date | null;
    }>(
      `SELECT id, code, type, uses_count, max_uses, referrer_bonus, referee_bonus,
              is_active, expires_at
         FROM referral_codes
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [customerId],
    ),
    db.query<{
      id: string;
      referee_id: string;
      referee_name: string;
      referee_bonus: number;
      referrer_bonus: number;
      referrer_credited: boolean;
      qualifying_booking_id: string | null;
      created_at: Date;
    }>(
      `SELECT rr.id, rr.referee_id,
              (u.first_name || ' ' || u.last_name) AS referee_name,
              rr.referee_bonus, rr.referrer_bonus, rr.referrer_credited,
              rr.qualifying_booking_id, rr.created_at
         FROM referral_redemptions rr
         JOIN users u ON u.id = rr.referee_id
        WHERE rr.referrer_id = $1
        ORDER BY rr.created_at DESC
        LIMIT 200`,
      [customerId],
    ),
    db.query<{
      id: string;
      referrer_id: string;
      referrer_name: string;
      referee_bonus: number;
      referee_credited: boolean;
      created_at: Date;
    }>(
      `SELECT rr.id, rr.referrer_id,
              (u.first_name || ' ' || u.last_name) AS referrer_name,
              rr.referee_bonus, rr.referee_credited, rr.created_at
         FROM referral_redemptions rr
         JOIN users u ON u.id = rr.referrer_id
        WHERE rr.referee_id = $1
        LIMIT 1`,
      [customerId],
    ),
  ]);

  const given = givenResult.rows.map((r) => ({
    id: r.id,
    refereeId: r.referee_id,
    refereeName: r.referee_name,
    refereeBonus: Number(r.referee_bonus),
    referrerBonus: Number(r.referrer_bonus),
    referrerCredited: r.referrer_credited,
    qualifyingBookingId: r.qualifying_booking_id,
    createdAt: r.created_at.toISOString(),
  }));

  const totalEarnedFromReferrals = given
    .filter((r) => r.referrerCredited)
    .reduce((sum, r) => sum + r.referrerBonus, 0);

  return {
    ownCodes: codesResult.rows.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      usesCount: r.uses_count,
      maxUses: r.max_uses,
      referrerBonus: Number(r.referrer_bonus),
      refereeBonus: Number(r.referee_bonus),
      isActive: r.is_active,
      expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    })),
    given,
    received: receivedResult.rows[0]
      ? {
          id: receivedResult.rows[0].id,
          referrerId: receivedResult.rows[0].referrer_id,
          referrerName: receivedResult.rows[0].referrer_name,
          refereeBonus: Number(receivedResult.rows[0].referee_bonus),
          refereeCredited: receivedResult.rows[0].referee_credited,
          createdAt: receivedResult.rows[0].created_at.toISOString(),
        }
      : null,
    totalEarnedFromReferrals,
  };
}

// ─────────────────────────────────────────────────────────────────
// Activity (audit + login_attempts + admin_actions)
// ─────────────────────────────────────────────────────────────────

export async function getCustomerActivity(
  customerId: string,
  limit: number,
  // MED-N17 fix: same pattern as MED-N14 in provider-admin.service.
  // Junior admins see masked IPs + truncated user agents; super_admin
  // sees raw values. Defaults to 'admin' for callers not yet updated.
  requesterRole: 'admin' | 'super_admin' = 'admin',
): Promise<CustomerActivityRow[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 50));

  const userResult = await db.query<{ phone: string }>(
    `SELECT phone FROM users WHERE id = $1 AND role = 'customer'`,
    [customerId],
  );
  if (!userResult.rows[0]) throw createAppError('Customer not found.', 404);
  const phone = userResult.rows[0].phone;

  const [auditRows, loginRows, adminActionRows] = await Promise.all([
    db.query<{
      id: string;
      action: string;
      ip_address: string | null;
      user_agent: string | null;
      new_values: unknown;
      created_at: Date;
    }>(
      `SELECT id, action, ip_address::text, user_agent, new_values, created_at
         FROM audit_log
        WHERE entity_id = $1 AND entity_type IN ('users', 'customer')
        ORDER BY created_at DESC
        LIMIT $2`,
      [customerId, safeLimit],
    ),
    db.query<{
      id: string;
      attempt_type: string;
      success: boolean;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
    }>(
      `SELECT id, attempt_type, success, ip_address::text, user_agent, created_at
         FROM login_attempts
        WHERE phone = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [phone, safeLimit],
    ),
    db.query<{
      id: string;
      action_type: string;
      reason: string | null;
      details: unknown;
      created_at: Date;
    }>(
      `SELECT id, action_type, reason, details, created_at
         FROM admin_actions
        WHERE target_type = 'customer' AND target_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [customerId, safeLimit],
    ),
  ]);

  // MED-N17 fix: same masking helper pattern as MED-N14.
  const { maskIp, maskUserAgent } = await import('../utils/pii-mask');
  const maskIfNeeded = (ip: string | null): string | null => {
    if (ip === null) return null;
    return requesterRole === 'super_admin' ? ip : maskIp(ip);
  };
  const maskUaIfNeeded = (ua: string | null): string | null => {
    if (ua === null) return null;
    return requesterRole === 'super_admin' ? ua : maskUserAgent(ua);
  };

  const audit = auditRows.rows.map<CustomerActivityRow>((r) => ({
    id: `audit:${r.id}`,
    source: 'audit',
    action: r.action,
    detail: r.new_values ? JSON.stringify(r.new_values) : null,
    ipAddress: maskIfNeeded(r.ip_address),
    userAgent: maskUaIfNeeded(r.user_agent),
    createdAt: r.created_at.toISOString(),
  }));

  const logins = loginRows.rows.map<CustomerActivityRow>((r) => ({
    id: `login:${r.id}`,
    source: 'login',
    action: `${r.attempt_type}:${r.success ? 'ok' : 'fail'}`,
    detail: null,
    ipAddress: maskIfNeeded(r.ip_address),
    userAgent: maskUaIfNeeded(r.user_agent),
    createdAt: r.created_at.toISOString(),
  }));

  const adminActs = adminActionRows.rows.map<CustomerActivityRow>((r) => ({
    id: `admin_action:${r.id}`,
    source: 'admin_action',
    action: r.action_type,
    detail: r.reason ?? (r.details ? JSON.stringify(r.details) : null),
    ipAddress: null,
    userAgent: null,
    createdAt: r.created_at.toISOString(),
  }));

  return [...audit, ...logins, ...adminActs]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, safeLimit);
}

// ─────────────────────────────────────────────────────────────────
// Status mutations (suspend / reactivate / flag fraud)
// ─────────────────────────────────────────────────────────────────

export async function updateCustomerStatus(
  customerId: string,
  action: CustomerStatusAction,
  reason: string,
  adminUserId: string,
): Promise<{ isActive: boolean }> {
  const trimmed = reason?.trim();
  if (!trimmed || trimmed.length < 5) {
    throw createAppError('reason must be at least 5 characters.', 400);
  }
  if (action !== 'suspend' && action !== 'reactivate' && action !== 'flag_fraud') {
    throw createAppError('Invalid action.', 400);
  }

  return db.transaction(async (client) => {
    const userResult = await client.query<{ id: string; is_active: boolean }>(
      `SELECT id, is_active FROM users WHERE id = $1 AND role = 'customer' FOR UPDATE`,
      [customerId],
    );
    const user = userResult.rows[0];
    if (!user) throw createAppError('Customer not found.', 404);

    let newIsActive = user.is_active;
    // Phase L typecheck fix — widen union to include the
     // 'customer_flagged_fraud' branch added by MED-N15. Pre-fix the
     // narrower union made the assignment on line ~806 a TS2322.
    let actionType: 'customer_suspended' | 'customer_reactivated' | 'customer_flagged_fraud';

    if (action === 'suspend') {
      newIsActive = false;
      actionType = 'customer_suspended';
    } else if (action === 'reactivate') {
      newIsActive = true;
      actionType = 'customer_reactivated';
    } else {
      // MED-N15 fix: 'flag_fraud' now records correctly as
      // 'customer_flagged_fraud' (added to admin_actions.action_type
      // CHECK constraint in mig 096) AND sets users.is_flagged_fraud=TRUE
      // so the flag is queryable directly. Pre-fix the action wrote
      // 'customer_suspended' with a reason prefix, inflating
      // suspension counts in analytics and hiding the flag from
      // anyone querying admin_actions.action_type.
      actionType = 'customer_flagged_fraud';
    }

    if (action !== 'flag_fraud' && newIsActive !== user.is_active) {
      await client.query(
        `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`,
        [newIsActive, customerId],
      );
    }

    if (action === 'flag_fraud') {
      // MED-N15 fix: flip the queryable boolean so analytics + admin
      // listings can filter without parsing admin_actions reason.
      await client.query(
        `UPDATE users SET is_flagged_fraud = TRUE, updated_at = NOW() WHERE id = $1`,
        [customerId],
      );
    }

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, $2, 'customer', $3, $4::jsonb, $5)`,
      [
        adminUserId,
        actionType,
        customerId,
        JSON.stringify({ requestedAction: action }),
        trimmed,
      ],
    );

    logger.info('Customer status updated', {
      customerId,
      action,
      newIsActive,
      adminUserId,
    });

    return { isActive: newIsActive };
  });
}

// ─────────────────────────────────────────────────────────────────
// Wallet credit (SACRED: writes wallet + paired transaction in TX)
// ─────────────────────────────────────────────────────────────────

export async function creditCustomerWallet(
  customerId: string,
  deltaAmount: number,
  reason: string,
  adminUserId: string,
): Promise<WalletCreditResult> {
  if (!Number.isFinite(deltaAmount) || !Number.isInteger(deltaAmount) || deltaAmount === 0) {
    throw createAppError('deltaAmount must be a non-zero integer (centavos).', 400);
  }
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw createAppError('reason is required.', 400);
  if (trimmedReason.length < 5) throw createAppError('reason must be at least 5 characters.', 400);

  return db.transaction(async (client) => {
    // Verify customer exists
    const userResult = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND role = 'customer'`,
      [customerId],
    );
    if (!userResult.rows[0]) throw createAppError('Customer not found.', 404);

    // Get-or-create customer wallet (locked for update)
    let walletResult = await client.query<{ id: string; available_balance: string }>(
      `SELECT id, available_balance FROM wallets
        WHERE user_id = $1 AND type = 'customer'
        FOR UPDATE`,
      [customerId],
    );
    let wallet = walletResult.rows[0];
    if (!wallet) {
      const created = await client.query<{ id: string; available_balance: string }>(
        `INSERT INTO wallets (user_id, type) VALUES ($1, 'customer')
         RETURNING id, available_balance`,
        [customerId],
      );
      wallet = created.rows[0]!;
      // Re-lock for FOR UPDATE consistency
      walletResult = await client.query<{ id: string; available_balance: string }>(
        `SELECT id, available_balance FROM wallets WHERE id = $1 FOR UPDATE`,
        [wallet.id],
      );
      wallet = walletResult.rows[0]!;
    }

    const currentBalance = Number(wallet.available_balance);
    const newBalance = currentBalance + deltaAmount;
    if (newBalance < 0) {
      throw createAppError('Adjustment would make wallet balance negative.', 400);
    }

    await client.query(
      `UPDATE wallets SET available_balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, wallet.id],
    );

    const txResult = await client.query<{ id: string }>(
      `INSERT INTO wallet_transactions
         (wallet_id, amount, type, description, balance_after, reference_id)
       VALUES ($1, $2, 'adjustment', $3, $4, $5)
       RETURNING id`,
      [
        wallet.id,
        deltaAmount,
        `[admin:${adminUserId}] ${trimmedReason}`,
        newBalance,
        `admin_credit:${adminUserId}`,
      ],
    );
    const txId = txResult.rows[0]?.id;
    if (!txId) throw createAppError('Failed to record adjustment transaction.', 500);

    // Audit via admin_actions for first-class traceability
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'customer_credited', 'customer', $2, $3::jsonb, $4)`,
      [
        adminUserId,
        customerId,
        JSON.stringify({ deltaAmount, walletId: wallet.id, transactionId: txId }),
        trimmedReason,
      ],
    );

    logger.info('Customer wallet credit', {
      customerId,
      walletId: wallet.id,
      deltaAmount,
      newBalance,
      adminUserId,
      reason: trimmedReason,
    });

    return {
      walletId: wallet.id,
      newAvailableBalance: newBalance,
      transactionId: txId,
    };
  });
}
