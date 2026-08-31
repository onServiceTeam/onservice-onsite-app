/**
 * Phase 06 — Customer 360 admin service.
 * Read + write actions for the admin Customer Detail page (6 tabs).
 *
 * Sacred-file note: this service touches wallet balances via
 * `creditCustomerWallet` (super-admin manual credit). That single function is
 * gated by super-admin role + always writes a paired wallet_transaction
 * within a transaction so money conservation holds. Account enforcement also
 * updates users, revokes refresh sessions when suspending, and writes an audit
 * row plus a generic customer notification in one transaction.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as settingsService from './settings.service';
import { maskPhilippinePhone, maskEmail } from '../utils/pii-mask';
import { ACTIVE_BOOKING_STATUSES } from '../types/booking.types';

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
  // D25: phone/email are masked for every role except super_admin. contactMasked
  // tells the UI to offer an audit-logged "reveal" (POST /:id/reveal-contact).
  contactMasked: boolean;
  avatarUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  isFlaggedFraud: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  lifetimeBookings: number;
  lifetimeSpent: number;
  activeBookings: number;
  openDisputes: number;
  averageRatingGiven: number | null;
  totalReviewsGiven: number;
  activeRefreshSessions: number;
  openSupportCases: number;
  urgentSupportCases: number;
  unassignedSupportCases: number;
  supportOwnerNames: string[];
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
    providerId: string | null;
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
  providerId: string | null;
  providerBusinessName: string | null;
  type: string;
  status: string;
  resolutionType: string | null;
  refundAmount: number;
  filedById: string;
  filedByRole: string;
  filedByName: string;
  createdAt: string;
}

export interface CustomerDisputesResult {
  rows: CustomerDispute[];
  total: number;
  page: number;
  pageSize: number;
  fraudPattern: {
    disputesInWindow: number;
    windowDays: number;
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
  totalReferrals: number;
  creditedReferrals: number;
  pendingReferrals: number;
}

export interface CustomerActivityRow {
  id: string;
  source: 'audit' | 'login' | 'admin_action';
  action: string;
  detail: string | null;
  actor: {
    kind: 'customer' | 'admin' | 'system';
    id: string | null;
    name: string | null;
  };
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

export async function getCustomerProfile(
  customerId: string,
  actorRole: string,
): Promise<CustomerProfile> {
  const userResult = await db.query<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_active: boolean;
    is_flagged_fraud: boolean;
    active_refresh_sessions: string;
    open_support_cases: string;
    urgent_support_cases: string;
    unassigned_support_cases: string;
    support_owner_names: string[] | null;
    last_login_at: Date | null;
    created_at: Date;
  }>(
    `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.avatar_url,
            u.is_verified, u.is_active, u.is_flagged_fraud, u.last_login_at, u.created_at,
            (SELECT COUNT(*)::text FROM refresh_tokens rt WHERE rt.user_id = u.id) AS active_refresh_sessions,
            (SELECT COUNT(*)::text
               FROM support_tickets st
               LEFT JOIN bookings support_booking ON support_booking.id = st.booking_id
              WHERE (st.user_id = u.id OR support_booking.customer_id = u.id)
                AND st.status NOT IN ('resolved', 'closed')) AS open_support_cases,
            (SELECT COUNT(*)::text
               FROM support_tickets st
               LEFT JOIN bookings support_booking ON support_booking.id = st.booking_id
              WHERE (st.user_id = u.id OR support_booking.customer_id = u.id)
                AND st.status NOT IN ('resolved', 'closed')
                AND st.priority = 'urgent') AS urgent_support_cases,
            (SELECT COUNT(*)::text
               FROM support_tickets st
               LEFT JOIN bookings support_booking ON support_booking.id = st.booking_id
              WHERE (st.user_id = u.id OR support_booking.customer_id = u.id)
                AND st.status NOT IN ('resolved', 'closed')
                AND st.assigned_agent_id IS NULL) AS unassigned_support_cases,
            ARRAY(
              SELECT DISTINCT NULLIF(CONCAT_WS(' ', owner.first_name, owner.last_name), '')
                FROM support_tickets st
                LEFT JOIN bookings support_booking ON support_booking.id = st.booking_id
                JOIN users owner ON owner.id = st.assigned_agent_id
               WHERE (st.user_id = u.id OR support_booking.customer_id = u.id)
                 AND st.status NOT IN ('resolved', 'closed')
               ORDER BY NULLIF(CONCAT_WS(' ', owner.first_name, owner.last_name), '')
            ) AS support_owner_names
       FROM users u
      WHERE u.id = $1 AND u.role = 'customer'`,
    [customerId],
  );
  const u = userResult.rows[0];
  if (!u) throw createAppError('Customer not found.', 404);

  const [stats, addresses, suki] = await Promise.all([
    db.query<{
      lifetime_bookings: string;
      lifetime_spent: string;
      active_bookings: string;
      open_disputes: string;
      avg_rating: string | null;
      total_reviews: string;
    }>(
      `SELECT
         COUNT(b.id)::text AS lifetime_bookings,
         COALESCE(SUM(CASE WHEN b.status = 'confirmed' OR b.status = 'paid_out' THEN b.total_amount ELSE 0 END), 0)::text AS lifetime_spent,
         COUNT(b.id) FILTER (WHERE b.status = ANY($2::text[]))::text AS active_bookings,
         (SELECT COUNT(*)::text
            FROM disputes d
            JOIN bookings dispute_booking ON dispute_booking.id = d.booking_id
           WHERE dispute_booking.customer_id = $1
             AND d.status IN ('open', 'under_review', 'escalated')) AS open_disputes,
         (SELECT AVG(rating)::text FROM reviews WHERE reviewer_id = $1) AS avg_rating,
         (SELECT COUNT(*)::text FROM reviews WHERE reviewer_id = $1) AS total_reviews
         FROM bookings b
        WHERE b.customer_id = $1`,
      [customerId, ACTIVE_BOOKING_STATUSES],
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
  // D25: data-minimization — only super_admin sees raw contact by default;
  // everyone else (INCLUDING dpo) gets masked values plus an audit-logged
  // reveal. This is CONTACT masking; the separate activity IP/UA masking treats
  // dpo like super_admin (raw IP) per pii-mask.ts, but contact stays masked for
  // dpo to match maskPiiForRole's convention (dpo: masked phone/email).
  const contactMasked = actorRole !== 'super_admin';
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    fullName: `${u.first_name} ${u.last_name}`.trim(),
    phone: contactMasked ? maskPhilippinePhone(u.phone) : u.phone,
    email: contactMasked ? (u.email ? maskEmail(u.email) : null) : u.email,
    contactMasked,
    avatarUrl: u.avatar_url,
    isVerified: u.is_verified,
    isActive: u.is_active,
    isFlaggedFraud: u.is_flagged_fraud,
    lastLoginAt: u.last_login_at ? u.last_login_at.toISOString() : null,
    createdAt: u.created_at.toISOString(),
    lifetimeBookings: Number(s?.lifetime_bookings ?? 0),
    lifetimeSpent: Number(s?.lifetime_spent ?? 0),
    activeBookings: Number(s?.active_bookings ?? 0),
    openDisputes: Number(s?.open_disputes ?? 0),
    averageRatingGiven: s?.avg_rating ? Number(s.avg_rating) : null,
    totalReviewsGiven: Number(s?.total_reviews ?? 0),
    activeRefreshSessions: Number(u.active_refresh_sessions ?? 0),
    openSupportCases: Number(u.open_support_cases ?? 0),
    urgentSupportCases: Number(u.urgent_support_cases ?? 0),
    unassignedSupportCases: Number(u.unassigned_support_cases ?? 0),
    supportOwnerNames: (u.support_owner_names ?? []).filter(Boolean),
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

/**
 * D25 — audit-logged reveal of a customer's raw phone + email. Any admin may
 * reveal (e.g. support needs to call a customer), but the reveal is recorded in
 * admin_actions (action_type='pii_reveal') so there is a trail of who looked at
 * whose contact info and when — exactly what NPC registration expects.
 */
export async function revealCustomerContact(
  customerId: string,
  adminId: string,
): Promise<{ phone: string; email: string | null }> {
  return db.transaction(async (client) => {
    const result = await client.query<{ phone: string; email: string | null }>(
      `SELECT phone, email FROM users WHERE id = $1 AND role = 'customer'`,
      [customerId],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Customer not found.', 404);

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'pii_reveal', 'customer', $2, $3::jsonb)`,
      [adminId, customerId, JSON.stringify({ fields: ['phone', 'email'] })],
    );
    logger.info('Customer contact revealed', { adminId, customerId });
    return { phone: row.phone, email: row.email };
  });
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
      provider_id: string | null;
      payment_method: string;
      status: string;
      amount: number;
      created_at: Date;
    }>(
      `SELECT pi.id, pi.booking_id, b.provider_id,
              pi.payment_method, pi.status, pi.amount, pi.created_at
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
      providerId: r.provider_id,
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

export async function getCustomerDisputes(
  customerId: string,
  page = 1,
  pageSize = 20,
): Promise<CustomerDisputesResult> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
      WHERE b.customer_id = $1`,
    [customerId],
  );

  const result = await db.query<{
    id: string;
    booking_id: string;
    provider_id: string | null;
    business_name: string | null;
    type: string;
    status: string;
    resolution_type: string | null;
    refund_amount: number | null;
    filed_by: string;
    filed_by_role: string;
    filed_by_name: string;
    created_at: Date;
  }>(
    `SELECT d.id, d.booking_id, b.provider_id,
            p.business_name,
            d.type, d.status, d.resolution_type,
            COALESCE(d.refund_amount, 0) AS refund_amount,
            d.filed_by,
            filer.role AS filed_by_role,
            COALESCE(
              NULLIF(CONCAT_WS(' ', filer.first_name, filer.last_name), ''),
              filer_provider.business_name,
              'Unknown user'
            ) AS filed_by_name,
            d.created_at
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       JOIN users filer ON filer.id = d.filed_by
       LEFT JOIN providers filer_provider ON filer_provider.user_id = filer.id
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.customer_id = $1
      ORDER BY d.created_at DESC
      LIMIT $2 OFFSET $3`,
    [customerId, safePageSize, offset],
  );

  const rows = result.rows.map<CustomerDispute>((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    providerId: r.provider_id,
    providerBusinessName: r.business_name,
    type: r.type,
    status: r.status,
    resolutionType: r.resolution_type,
    refundAmount: Number(r.refund_amount ?? 0),
    filedById: r.filed_by,
    filedByRole: r.filed_by_role,
    filedByName: r.filed_by_name,
    createdAt: r.created_at.toISOString(),
  }));

  // MED-N16 fix: fraud-pattern thresholds are now admin-tunable.
  // Pre-fix: hardcoded 5 disputes / 30 days / 80% threshold. Ops
  // couldn't adjust as real-world dispute patterns revealed
  // themselves. Now: read from platform_settings (defaults match
  // the original constants).
  let countThreshold = 5;
  let windowDays = 30;
  let favorRateThreshold = 0.8;
  try {
    countThreshold = await settingsService.getSettingInteger(
      'fraud_pattern_dispute_count_threshold',
    );
    windowDays = await settingsService.getSettingInteger('fraud_pattern_window_days');
    favorRateThreshold = Number(
      await settingsService.getSetting('fraud_pattern_favor_provider_rate'),
    );
    if (!Number.isFinite(favorRateThreshold)) favorRateThreshold = 0.8;
  } catch (err) {
    logger.warn('Fraud-pattern threshold settings unreadable; using built-in defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fraud review is deliberately narrower than the support list above. The
  // list includes every case attached to the customer's bookings, including a
  // provider-filed case. Fraud signals count only cases the customer filed.
  const fraudResult = await db.query<{
    disputes_in_window: string;
    resolved_in_window: string;
    no_refund_in_window: string;
  }>(
    `SELECT COUNT(*)::text AS disputes_in_window,
            COUNT(*) FILTER (WHERE d.status = 'resolved')::text AS resolved_in_window,
            COUNT(*) FILTER (
              WHERE d.status = 'resolved' AND d.resolution_type = 'no_refund'
            )::text AS no_refund_in_window
       FROM disputes d
      WHERE d.filed_by = $1
        AND d.created_at >= NOW() - ($2::integer * INTERVAL '1 day')`,
    [customerId, windowDays],
  );
  const fraud = fraudResult.rows[0];
  const disputesInWindow = Number(fraud?.disputes_in_window ?? 0);
  const resolvedInWindow = Number(fraud?.resolved_in_window ?? 0);
  const noRefundInWindow = Number(fraud?.no_refund_in_window ?? 0);
  const favorProviderRate = resolvedInWindow > 0 ? noRefundInWindow / resolvedInWindow : null;
  const flagged =
    disputesInWindow >= countThreshold &&
    favorProviderRate !== null &&
    favorProviderRate >= favorRateThreshold;
  let reason: string | null = null;
  if (flagged) {
    const pct = Math.round((favorProviderRate ?? 0) * 100);
    reason = `Filed ${disputesInWindow} disputes in ${windowDays} days; ${pct}% of resolved cases ended with no refund — possible fraudulent pattern.`;
  }

  return {
    rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
    fraudPattern: {
      disputesInWindow,
      windowDays,
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
  const [codesResult, givenResult, receivedResult, summaryResult] = await Promise.all([
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
    db.query<{
      total_referrals: string;
      credited_referrals: string;
      pending_referrals: string;
      total_earned: string;
    }>(
      `SELECT COUNT(*)::text AS total_referrals,
              COUNT(*) FILTER (WHERE referrer_credited = TRUE)::text AS credited_referrals,
              COUNT(*) FILTER (WHERE referrer_credited = FALSE)::text AS pending_referrals,
              COALESCE(SUM(referrer_bonus) FILTER (WHERE referrer_credited = TRUE), 0)::text AS total_earned
         FROM referral_redemptions
        WHERE referrer_id = $1`,
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

  const summary = summaryResult.rows[0];
  const totalEarnedFromReferrals = Number(summary?.total_earned ?? 0);

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
    totalReferrals: Number(summary?.total_referrals ?? 0),
    creditedReferrals: Number(summary?.credited_referrals ?? 0),
    pendingReferrals: Number(summary?.pending_referrals ?? 0),
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

  const userResult = await db.query<{ phone: string; first_name: string | null; last_name: string | null }>(
    `SELECT phone, first_name, last_name FROM users WHERE id = $1 AND role = 'customer'`,
    [customerId],
  );
  if (!userResult.rows[0]) throw createAppError('Customer not found.', 404);
  const phone = userResult.rows[0].phone;
  const customerName = `${userResult.rows[0].first_name ?? ''} ${userResult.rows[0].last_name ?? ''}`.trim();

  const [auditRows, loginRows, adminActionRows] = await Promise.all([
    db.query<{
      id: string;
      user_id: string | null;
      actor_first: string | null;
      actor_last: string | null;
      action: string;
      ip_address: string | null;
      user_agent: string | null;
      new_values: unknown;
      created_at: Date;
    }>(
      `SELECT al.id, al.user_id, u.first_name AS actor_first, u.last_name AS actor_last,
              al.action, al.ip_address::text, al.user_agent, al.new_values, al.created_at
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
        WHERE al.entity_id = $1 AND al.entity_type IN ('users', 'customer')
        ORDER BY al.created_at DESC
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
      admin_id: string;
      admin_first: string | null;
      admin_last: string | null;
      action_type: string;
      reason: string | null;
      details: unknown;
      created_at: Date;
    }>(
      `SELECT a.id, a.admin_id, u.first_name AS admin_first, u.last_name AS admin_last,
              a.action_type, a.reason, a.details, a.created_at
         FROM admin_actions a
         LEFT JOIN users u ON u.id = a.admin_id
        WHERE a.target_id = $1 AND a.target_type IN ('customer', 'user')
        ORDER BY a.created_at DESC
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

  const audit = auditRows.rows.map<CustomerActivityRow>((r) => {
    const actorName = `${r.actor_first ?? ''} ${r.actor_last ?? ''}`.trim() || null;
    return {
      id: `audit:${r.id}`,
      source: 'audit',
      action: r.action,
      detail: r.new_values ? JSON.stringify(r.new_values) : null,
      actor: {
        kind: r.user_id === customerId ? 'customer' : r.user_id ? 'admin' : 'system',
        id: r.user_id,
        name: actorName,
      },
      ipAddress: maskIfNeeded(r.ip_address),
      userAgent: maskUaIfNeeded(r.user_agent),
      createdAt: r.created_at.toISOString(),
    };
  });

  const logins = loginRows.rows.map<CustomerActivityRow>((r) => ({
    id: `login:${r.id}`,
    source: 'login',
    action: `${r.attempt_type}:${r.success ? 'ok' : 'fail'}`,
    detail: null,
    actor: { kind: 'customer', id: customerId, name: customerName || null },
    ipAddress: maskIfNeeded(r.ip_address),
    userAgent: maskUaIfNeeded(r.user_agent),
    createdAt: r.created_at.toISOString(),
  }));

  const adminActs = adminActionRows.rows.map<CustomerActivityRow>((r) => {
    const adminName = `${r.admin_first ?? ''} ${r.admin_last ?? ''}`.trim() || null;
    return {
      id: `admin_action:${r.id}`,
      source: 'admin_action',
      action: r.action_type,
      detail: r.reason ?? (r.details ? JSON.stringify(r.details) : null),
      actor: { kind: 'admin', id: r.admin_id, name: adminName },
      ipAddress: null,
      userAgent: null,
      createdAt: r.created_at.toISOString(),
    };
  });

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
  if (!trimmed || trimmed.length < 10) {
    throw createAppError('reason must be at least 10 characters.', 400);
  }
  // BUG-PHASE160-01 fix — admin-action reasons are bounded before they
  // reach the unbounded TEXT ledger column.
  if (trimmed.length > 2000) {
    throw createAppError('reason must be ≤ 2000 characters.', 400);
  }
  if (action !== 'suspend' && action !== 'reactivate' && action !== 'flag_fraud') {
    throw createAppError('Invalid action.', 400);
  }

  return db.transaction(async (client) => {
    const userResult = await client.query<{ id: string; is_active: boolean; is_flagged_fraud: boolean }>(
      `SELECT id, is_active, is_flagged_fraud FROM users WHERE id = $1 AND role = 'customer' FOR UPDATE`,
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
      if (!user.is_active) throw createAppError('Customer is already suspended.', 409);
      newIsActive = false;
      actionType = 'customer_suspended';
    } else if (action === 'reactivate') {
      if (user.is_active) throw createAppError('Customer is already active.', 409);
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
      if (user.is_flagged_fraud) throw createAppError('Customer is already flagged for fraud review.', 409);
      actionType = 'customer_flagged_fraud';
    }

    if (action === 'suspend') {
      // A simple is_active flip blocks requests only while the account stays
      // suspended. Without a generation bump, an old access token becomes
      // valid again after reactivation. Incrementing session_version makes the
      // suspension a durable all-credential revocation.
      await client.query(
        `UPDATE users
            SET is_active = FALSE,
                session_version = session_version + 1,
                updated_at = NOW()
          WHERE id = $1`,
        [customerId],
      );
    } else if (action === 'reactivate') {
      await client.query(
        `UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1`,
        [customerId],
      );
    }

    let revokedSessionCount = 0;
    if (action === 'suspend') {
      const revoked = await client.query(
        `DELETE FROM refresh_tokens WHERE user_id = $1`,
        [customerId],
      );
      revokedSessionCount = revoked.rowCount ?? 0;
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
        JSON.stringify({
          requestedAction: action,
          previousIsActive: user.is_active,
          nextIsActive: newIsActive,
          previousFraudFlag: user.is_flagged_fraud,
          nextFraudFlag: action === 'flag_fraud' ? true : user.is_flagged_fraud,
          revokedSessionCount,
          allAccessCredentialsInvalidated: action === 'suspend',
        }),
        trimmed,
      ],
    );

    if (action === 'suspend' || action === 'reactivate') {
      const suspended = action === 'suspend';
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          customerId,
          suspended ? 'customer_suspended' : 'customer_reactivated',
          suspended ? 'Account suspended' : 'Account reactivated',
          suspended
            ? 'Your onService account has been suspended. Contact support if you need help with an active booking or want the decision reviewed.'
            : 'Your onService account has been reactivated. Please sign in again to continue.',
          JSON.stringify({ accountStatus: suspended ? 'suspended' : 'active' }),
        ],
      );
    }

    logger.info('Customer status updated', {
      customerId,
      action,
      newIsActive,
      adminUserId,
    });

    return { isActive: newIsActive };
  });
}

export async function revokeCustomerSessions(
  customerId: string,
  reason: string,
  adminUserId: string,
): Promise<{ revokedRefreshSessions: number; sessionVersion: number }> {
  const trimmedReason = reason?.trim();
  if (!trimmedReason || trimmedReason.length < 10 || trimmedReason.length > 1000) {
    throw createAppError('reason must be between 10 and 1000 characters.', 400);
  }

  return db.transaction(async (client) => {
    const updated = await client.query<{ session_version: number | string }>(
      `UPDATE users
          SET session_version = session_version + 1,
              updated_at = NOW()
        WHERE id = $1 AND role = 'customer'
        RETURNING session_version`,
      [customerId],
    );
    if (!updated.rows[0]) throw createAppError('Customer not found.', 404);

    const revoked = await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [customerId]);
    const revokedRefreshSessions = revoked.rowCount ?? 0;
    const sessionVersion = Number(updated.rows[0].session_version);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'user_force_logout', 'user', $2, $3::jsonb, $4, $5)`,
      [
        adminUserId,
        customerId,
        JSON.stringify({ accountType: 'customer', revokedRefreshSessions, sessionVersion }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );

    return { revokedRefreshSessions, sessionVersion };
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
  // BUG-PHASE160-01 fix — pre-fix had min(5) but no max. Same
  // defense-in-depth pattern as Phase 152-159. Cap at 2000.
  if (trimmedReason.length > 2000) {
    throw createAppError('reason must be ≤ 2000 characters.', 400);
  }

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
