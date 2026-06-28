/**
 * Phase 05 — Provider 360 admin service.
 * Read + write actions for the admin Provider Detail page (7 tabs).
 *
 * Sacred-file note: this service DOES touch wallet balances via
 * `adjustProviderWallet` (super-admin manual adjustment). That single function
 * is gated by super-admin role + always writes a paired wallet_transaction
 * within a transaction so money conservation holds. All other functions are
 * read-only or write to provider_admin_notes / providers metadata only.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as kycDocumentService from './kyc-document.service';
import { maskPhilippinePhone, maskEmail } from '../utils/pii-mask';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type NoteCategory = 'general' | 'quality' | 'financial' | 'legal';

// The provider vetting questionnaire blob (providers.vetting_answers JSONB).
// Stored verbatim from onboarding; every field optional so the shape can grow
// without a migration. The admin provider-detail page renders these.
export interface VettingAnswers {
  mainSkills?: string;
  hasOwnTools?: boolean;
  businessType?: string;
  yearStarted?: string;
  teamSize?: string;
  fullAddress?: string;
  website?: string;
  facebook?: string;
  socialOther?: string;
  credentials?: string;
  registrations?: string;
  resumeUrl?: string;
  references?: Array<{ name: string; contact: string; relation?: string }>;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  businessName: string;
  description: string;
  tier: string;
  status: string;
  averageRating: number;
  totalReviews: number;
  totalJobsCompleted: number;
  serviceRadiusKm: number;
  yearsExperience: number | null;
  vettingAnswers: VettingAnswers | null;
  city: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    email: string | null;
    // D25: masked for non-super_admin; contactMasked drives the reveal affordance.
    contactMasked: boolean;
    avatarUrl: string | null;
    isVerified: boolean;
    isActive: boolean;
    lastLoginAt: string | null;
  };
  documents: {
    // §35a — these are authenticated proxy PATHS (admin-only), not raw storage
    // URLs. The admin app fetches them with its bearer token; the file is read
    // server-side from the private KYC bucket. null when no document uploaded.
    nbiClearanceUrl: string | null;
    nbiExpiryDate: string | null;
    nbiExpiryNotified: boolean;
    avatarUrl: string | null;
    governmentIdUrl: string | null;
    governmentIdBackUrl: string | null;
    selfieUrl: string | null;
  };
  categories: { id: string; name: string; basePrice: number | null }[];
  serviceAreas: { id: string; name: string; isPrimary: boolean }[];
}

export interface JobRow {
  id: string;
  customerId: string;
  customerName: string;
  categoryName: string;
  status: string;
  totalAmount: number;
  serviceFee: number;
  scheduledAt: string;
  completedAt: string | null;
  rating: number | null;
  hasDispute: boolean;
}

export interface ProviderJobsResult {
  rows: JobRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProviderFinancials {
  totalEarned: number;
  totalCommissionPaid: number;
  walletAvailable: number;
  walletPending: number;
  monthlyEarnings: { month: string; amount: number }[];
  recentPayouts: {
    id: string;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }[];
}

export interface ProviderReview {
  id: string;
  bookingId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  isVisible: boolean;
  adminResponse: string | null;
  imageUrls: string[];
  createdAt: string;
}

export interface ProviderDispute {
  id: string;
  bookingId: string;
  customerName: string;
  status: string;
  resolutionType: string | null;
  createdAt: string;
}

export interface ProviderActivityRow {
  id: string;
  source: 'audit' | 'login';
  action: string;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ProviderNote {
  id: string;
  providerId: string;
  authorId: string;
  authorName: string;
  category: NoteCategory;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const NOTE_CATEGORIES: ReadonlyArray<NoteCategory> = ['general', 'quality', 'financial', 'legal'];
export function isNoteCategory(v: unknown): v is NoteCategory {
  return typeof v === 'string' && (NOTE_CATEGORIES as ReadonlyArray<string>).includes(v);
}

// ─────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────

export async function getProviderProfile(providerId: string, actorRole: string): Promise<ProviderProfile> {
  const providerResult = await db.query<{
    id: string;
    user_id: string;
    business_name: string;
    description: string;
    tier: string;
    status: string;
    nbi_clearance_url: string | null;
    government_id_front_url: string | null;
    government_id_back_url: string | null;
    selfie_url: string | null;
    nbi_expiry_date: Date | null;
    nbi_expiry_notified: boolean;
    service_radius_km: number;
    years_experience: number | null;
    vetting_answers: VettingAnswers | null;
    rating: string;
    total_reviews: number;
    total_jobs: number;
    latitude: string | null;
    longitude: string | null;
    city: string | null;
    province: string | null;
    created_at: Date;
    updated_at: Date;
    u_id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_active: boolean;
    last_login_at: Date | null;
  }>(
    `SELECT p.*, u.id AS u_id, u.first_name, u.last_name, u.phone, u.email,
            u.avatar_url, u.is_verified, u.is_active, u.last_login_at
       FROM providers p
       JOIN users u ON u.id = p.user_id
      WHERE p.id = $1`,
    [providerId],
  );

  const p = providerResult.rows[0];
  if (!p) throw createAppError('Provider not found.', 404);

  const [categoriesResult, areasResult] = await Promise.all([
    db.query<{ id: string; name: string; base_price: number | null }>(
      `SELECT sc.id, sc.name, ps.base_price
         FROM provider_services ps
         JOIN service_categories sc ON sc.id = ps.category_id
        WHERE ps.provider_id = $1 AND ps.is_active = TRUE
        ORDER BY sc.name`,
      [providerId],
    ),
    db.query<{ id: string; name: string; is_primary: boolean }>(
      `SELECT sa.id, sa.name, COALESCE(psa.is_primary, FALSE) AS is_primary
         FROM provider_service_areas psa
         JOIN service_areas sa ON sa.id = psa.service_area_id
        WHERE psa.provider_id = $1
        ORDER BY psa.is_primary DESC, sa.name`,
      [providerId],
    ),
  ]);

  // D25: super_admin (and DPO) see raw contact; everyone else gets masked
  // values plus a reveal affordance that writes an audit row.
  const contactMasked = actorRole !== 'super_admin' && actorRole !== 'dpo';

  return {
    id: p.id,
    userId: p.user_id,
    businessName: p.business_name,
    description: p.description,
    tier: p.tier,
    status: p.status,
    averageRating: Number(p.rating),
    totalReviews: p.total_reviews,
    totalJobsCompleted: p.total_jobs,
    serviceRadiusKm: p.service_radius_km,
    yearsExperience: p.years_experience,
    vettingAnswers: p.vetting_answers,
    city: p.city,
    province: p.province,
    latitude: p.latitude !== null ? Number(p.latitude) : null,
    longitude: p.longitude !== null ? Number(p.longitude) : null,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
    user: {
      id: p.u_id,
      firstName: p.first_name,
      lastName: p.last_name,
      fullName: `${p.first_name} ${p.last_name}`.trim(),
      phone: contactMasked ? maskPhilippinePhone(p.phone) : p.phone,
      email: contactMasked ? (p.email ? maskEmail(p.email) : null) : p.email,
      contactMasked,
      avatarUrl: p.avatar_url,
      isVerified: p.is_verified,
      isActive: p.is_active,
      lastLoginAt: p.last_login_at ? p.last_login_at.toISOString() : null,
    },
    // §35a — never emit the raw storage URL for KYC PII. Return an
    // authenticated proxy path (admin-only) that the admin app fetches WITH
    // its bearer token; the actual object is read server-side from the
    // private KYC bucket. A field is null when no document was uploaded.
    documents: {
      nbiClearanceUrl: p.nbi_clearance_url
        ? kycDocumentService.kycProxyPath('admin', 'nbi_clearance', p.id) : null,
      nbiExpiryDate: p.nbi_expiry_date ? p.nbi_expiry_date.toISOString().slice(0, 10) : null,
      nbiExpiryNotified: p.nbi_expiry_notified,
      avatarUrl: p.avatar_url,
      governmentIdUrl: p.government_id_front_url
        ? kycDocumentService.kycProxyPath('admin', 'government_id_front', p.id) : null,
      governmentIdBackUrl: p.government_id_back_url
        ? kycDocumentService.kycProxyPath('admin', 'government_id_back', p.id) : null,
      selfieUrl: p.selfie_url
        ? kycDocumentService.kycProxyPath('admin', 'selfie', p.id) : null,
    },
    categories: categoriesResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      basePrice: r.base_price !== null ? Number(r.base_price) : null,
    })),
    serviceAreas: areasResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      isPrimary: r.is_primary,
    })),
  };
}

/**
 * D25 — audit-logged reveal of a provider's raw phone + email.
 * Any admin may call it; the reveal itself is the recorded action
 * (admin_actions.action_type = 'pii_reveal'). super_admin already sees raw
 * values, so this is mainly for junior admins who need a one-off lookup.
 */
export async function revealProviderContact(
  providerId: string,
  adminId: string,
): Promise<{ phone: string; email: string | null }> {
  const result = await db.query<{ phone: string; email: string | null }>(
    `SELECT u.phone, u.email
       FROM providers pr
       JOIN users u ON u.id = pr.user_id
      WHERE pr.id = $1`,
    [providerId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Provider not found.', 404);
  await db.query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
     VALUES ($1, 'pii_reveal', 'provider', $2, $3::jsonb)`,
    [adminId, providerId, JSON.stringify({ fields: ['phone', 'email'] })],
  );
  logger.info('Provider contact revealed', { adminId, providerId });
  return { phone: row.phone, email: row.email };
}

// ─────────────────────────────────────────────────────────────────
// Jobs
// ─────────────────────────────────────────────────────────────────

export async function getProviderJobs(
  providerId: string,
  page: number,
  pageSize: number,
  status?: string,
): Promise<ProviderJobsResult> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;

  const params: unknown[] = [providerId];
  let where = 'WHERE b.provider_id = $1';
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
    customer_id: string;
    customer_name: string;
    category_name: string;
    status: string;
    total_amount: number;
    service_fee: number;
    scheduled_at: Date;
    completed_at: Date | null;
    rating: number | null;
    has_dispute: boolean;
  }>(
    `SELECT b.id, b.customer_id,
            (cu.first_name || ' ' || cu.last_name) AS customer_name,
            sc.name AS category_name,
            b.status, b.total_amount, b.service_fee,
            b.scheduled_at, b.completed_at,
            r.rating,
            EXISTS (SELECT 1 FROM disputes d WHERE d.booking_id = b.id) AS has_dispute
       FROM bookings b
       JOIN users cu ON cu.id = b.customer_id
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN reviews r ON r.booking_id = b.id
       ${where}
      ORDER BY b.scheduled_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    rows: rowsResult.rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      categoryName: r.category_name ?? 'Uncategorized',
      status: r.status,
      totalAmount: r.total_amount,
      serviceFee: r.service_fee,
      scheduledAt: r.scheduled_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      rating: r.rating,
      hasDispute: r.has_dispute,
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

// ─────────────────────────────────────────────────────────────────
// Financials
// ─────────────────────────────────────────────────────────────────

export async function getProviderFinancials(providerId: string): Promise<ProviderFinancials> {
  const [totalsRow, walletRow, monthlyRow, payoutsRow] = await Promise.all([
    db.query<{ earned: string; commission: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN wt.type = 'escrow_release' AND wt.amount > 0 THEN wt.amount ELSE 0 END), 0)::text AS earned,
         COALESCE(SUM(CASE WHEN wt.type = 'commission' THEN ABS(wt.amount) ELSE 0 END), 0)::text AS commission
         FROM wallet_transactions wt
         JOIN wallets w ON w.id = wt.wallet_id
         JOIN providers p ON p.user_id = w.user_id
        WHERE p.id = $1`,
      [providerId],
    ),
    db.query<{ available: string; pending: string }>(
      `SELECT COALESCE(w.available_balance, 0)::text AS available,
              COALESCE(w.pending_balance, 0)::text AS pending
         FROM providers p
         LEFT JOIN wallets w ON w.user_id = p.user_id AND w.type = 'provider'
        WHERE p.id = $1`,
      [providerId],
    ),
    db.query<{ month: string; amount: string }>(
      `SELECT to_char(date_trunc('month', wt.created_at), 'YYYY-MM') AS month,
              COALESCE(SUM(wt.amount), 0)::text AS amount
         FROM wallet_transactions wt
         JOIN wallets w ON w.id = wt.wallet_id
         JOIN providers p ON p.user_id = w.user_id
        WHERE p.id = $1
          AND wt.type = 'escrow_release'
          AND wt.amount > 0
          AND wt.created_at >= NOW() - INTERVAL '12 months'
        GROUP BY 1
        ORDER BY 1 ASC`,
      [providerId],
    ),
    db.query<{
      id: string;
      amount: number;
      method: string;
      status: string;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, amount, method, status, created_at, completed_at
         FROM payouts
        WHERE provider_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [providerId],
    ),
  ]);

  return {
    totalEarned: Number(totalsRow.rows[0]?.earned ?? 0),
    totalCommissionPaid: Number(totalsRow.rows[0]?.commission ?? 0),
    walletAvailable: Number(walletRow.rows[0]?.available ?? 0),
    walletPending: Number(walletRow.rows[0]?.pending ?? 0),
    monthlyEarnings: monthlyRow.rows.map((r) => ({
      month: r.month,
      amount: Number(r.amount),
    })),
    recentPayouts: payoutsRow.rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      method: r.method,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────────────

// MED-N13 fix — pre-fix this returned a hardcoded LIMIT 200 with no
// pagination. Providers with 200+ reviews silently lost the rest.
// Post-fix: standard page/pageSize, returns total count alongside the
// page so admin UI can render pagination controls. Defaults preserve
// the old behaviour for callers that don't pass params.
export async function getProviderReviews(
  providerId: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<{ rows: ProviderReview[]; total: number; page: number; pageSize: number }> {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safeSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM reviews WHERE provider_id = $1`,
      [providerId],
    ),
    db.query<{
      id: string;
      booking_id: string;
      reviewer_name: string;
      rating: number;
      comment: string;
      is_visible: boolean;
      admin_response: string | null;
      image_urls: string[] | null;
      created_at: Date;
    }>(
      `SELECT r.id, r.booking_id,
              (u.first_name || ' ' || u.last_name) AS reviewer_name,
              r.rating, r.comment, r.is_visible, r.admin_response,
              ARRAY(SELECT image_url FROM review_images ri WHERE ri.review_id = r.id) AS image_urls,
              r.created_at
         FROM reviews r
         JOIN users u ON u.id = r.reviewer_id
        WHERE r.provider_id = $1
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3`,
      [providerId, safeSize, offset],
    ),
  ]);

  const rows: ProviderReview[] = dataResult.rows.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    reviewerName: r.reviewer_name,
    rating: r.rating,
    comment: r.comment,
    isVisible: r.is_visible,
    adminResponse: r.admin_response,
    imageUrls: r.image_urls ?? [],
    createdAt: r.created_at.toISOString(),
  }));

  return {
    rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    page: safePage,
    pageSize: safeSize,
  };
}

export async function setReviewVisibility(
  reviewId: string,
  isVisible: boolean,
): Promise<void> {
  const result = await db.query(
    `UPDATE reviews SET is_visible = $1, updated_at = NOW() WHERE id = $2`,
    [isVisible, reviewId],
  );
  if (result.rowCount === 0) throw createAppError('Review not found.', 404);
}

export async function setReviewAdminResponse(
  reviewId: string,
  response: string,
): Promise<void> {
  const result = await db.query(
    `UPDATE reviews SET admin_response = $1, updated_at = NOW() WHERE id = $2`,
    [response, reviewId],
  );
  if (result.rowCount === 0) throw createAppError('Review not found.', 404);
}

// ─────────────────────────────────────────────────────────────────
// Disputes
// ─────────────────────────────────────────────────────────────────

// MED-N13 fix — pagination same shape as getProviderReviews above.
export async function getProviderDisputes(
  providerId: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<{ rows: ProviderDispute[]; total: number; page: number; pageSize: number }> {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safeSize;

  const [countResult, dataResult] = await Promise.all([
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
        WHERE b.provider_id = $1`,
      [providerId],
    ),
    db.query<{
      id: string;
      booking_id: string;
      customer_name: string;
      status: string;
      resolution_type: string | null;
      created_at: Date;
    }>(
      `SELECT d.id, d.booking_id,
              (cu.first_name || ' ' || cu.last_name) AS customer_name,
              d.status,
              d.resolution_type,
              d.created_at
         FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
         JOIN users cu ON cu.id = b.customer_id
        WHERE b.provider_id = $1
        ORDER BY d.created_at DESC
        LIMIT $2 OFFSET $3`,
      [providerId, safeSize, offset],
    ),
  ]);

  const rows: ProviderDispute[] = dataResult.rows.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    customerName: r.customer_name,
    status: r.status,
    resolutionType: r.resolution_type,
    createdAt: r.created_at.toISOString(),
  }));

  return {
    rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    page: safePage,
    pageSize: safeSize,
  };
}

// ─────────────────────────────────────────────────────────────────
// Activity (audit + login history)
// ─────────────────────────────────────────────────────────────────

export async function getProviderActivity(
  providerId: string,
  limit: number,
  // MED-N14 fix: caller passes the requesting admin's role so
  // junior admins see masked IPs + truncated user agents. Defaults
  // to 'admin' (the most-restrictive role) so callers that haven't
  // been updated still get masking. super_admin sees raw values.
  requesterRole: 'admin' | 'super_admin' = 'admin',
): Promise<ProviderActivityRow[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 50));

  // 1. audit_log entries scoped to this provider entity OR to its user_id
  const userResult = await db.query<{ user_id: string; phone: string }>(
    `SELECT p.user_id, u.phone FROM providers p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [providerId],
  );
  if (!userResult.rows[0]) throw createAppError('Provider not found.', 404);
  const userId = userResult.rows[0].user_id;
  const phone = userResult.rows[0].phone;

  const [auditRows, loginRows] = await Promise.all([
    db.query<{
      id: string;
      action: string;
      entity_type: string;
      ip_address: string | null;
      user_agent: string | null;
      new_values: unknown;
      created_at: Date;
    }>(
      `SELECT id, action, entity_type, ip_address::text, user_agent, new_values, created_at
         FROM audit_log
        WHERE entity_id = $1 OR (entity_type = 'users' AND entity_id = $2)
        ORDER BY created_at DESC
        LIMIT $3`,
      [providerId, userId, safeLimit],
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
  ]);

  // MED-N14 fix: dynamic-import the masking helpers to avoid
  // pulling pii-mask into the cold-start graph for read paths
  // that don't need it. Junior admins see partial IPs +
  // category-only user agents; super_admin sees raw values.
  const { maskIp, maskUserAgent } = await import('../utils/pii-mask');
  const maskIfNeeded = (ip: string | null): string | null => {
    if (ip === null) return null;
    return requesterRole === 'super_admin' ? ip : maskIp(ip);
  };
  const maskUaIfNeeded = (ua: string | null): string | null => {
    if (ua === null) return null;
    return requesterRole === 'super_admin' ? ua : maskUserAgent(ua);
  };

  const audit = auditRows.rows.map<ProviderActivityRow>((r) => ({
    id: `audit:${r.id}`,
    source: 'audit',
    action: r.action,
    detail: r.new_values ? JSON.stringify(r.new_values) : null,
    ipAddress: maskIfNeeded(r.ip_address),
    userAgent: maskUaIfNeeded(r.user_agent),
    createdAt: r.created_at.toISOString(),
  }));

  const logins = loginRows.rows.map<ProviderActivityRow>((r) => ({
    id: `login:${r.id}`,
    source: 'login',
    action: `${r.attempt_type}:${r.success ? 'ok' : 'fail'}`,
    detail: null,
    ipAddress: maskIfNeeded(r.ip_address),
    userAgent: maskUaIfNeeded(r.user_agent),
    createdAt: r.created_at.toISOString(),
  }));

  return [...audit, ...logins]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, safeLimit);
}

// ─────────────────────────────────────────────────────────────────
// Notes (provider_admin_notes)
// ─────────────────────────────────────────────────────────────────

export async function listProviderNotes(providerId: string): Promise<ProviderNote[]> {
  // Phase 14 Dispatch 06 — Bug 80: filter soft-deleted notes from reads.
  const result = await db.query<{
    id: string;
    provider_id: string;
    author_id: string;
    author_name: string;
    category: NoteCategory;
    body: string;
    pinned: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT n.id, n.provider_id, n.author_id,
            (u.first_name || ' ' || u.last_name) AS author_name,
            n.category, n.body, n.pinned, n.created_at, n.updated_at
       FROM provider_admin_notes n
       JOIN users u ON u.id = n.author_id
      WHERE n.provider_id = $1 AND n.deleted_at IS NULL
      ORDER BY n.pinned DESC, n.created_at DESC`,
    [providerId],
  );

  return result.rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    authorId: r.author_id,
    authorName: r.author_name,
    category: r.category,
    body: r.body,
    pinned: r.pinned,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function createProviderNote(
  providerId: string,
  authorId: string,
  category: NoteCategory,
  body: string,
  pinned: boolean,
): Promise<ProviderNote> {
  if (!body.trim()) throw createAppError('Note body required.', 400);
  if (!isNoteCategory(category)) throw createAppError('Invalid category.', 400);

  // Phase 14 Dispatch 06 — Bug 82. Note INSERT + admin_actions audit
  // happen in ONE transaction. Pre-D06 the INSERT happened in a top-level
  // db.query and there was NO audit row at all, so admin-side note
  // creation left no traceable trail.
  return db.transaction(async (client) => {
    const trimmedBody = body.trim();
    const result = await client.query<{
      id: string;
      provider_id: string;
      author_id: string;
      category: NoteCategory;
      body: string;
      pinned: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO provider_admin_notes (provider_id, author_id, category, body, pinned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, provider_id, author_id, category, body, pinned, created_at, updated_at`,
      [providerId, authorId, category, trimmedBody, pinned],
    );

    const created = result.rows[0];
    if (!created) throw createAppError('Failed to create note.', 500);

    // Resolve author name in the same transaction so we can return the
    // formatted ProviderNote without a follow-up listProviderNotes call.
    const authorRow = await client.query<{ author_name: string }>(
      `SELECT (first_name || ' ' || last_name) AS author_name FROM users WHERE id = $1`,
      [authorId],
    );

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'provider_note_added', 'provider_note', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        authorId,
        created.id,
        JSON.stringify({ providerId, category, pinned, bodyLength: trimmedBody.length }),
        trimmedBody.slice(0, 500),
        trimmedBody,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record provider_note_added audit.', 500);
    }

    return {
      id: created.id,
      providerId: created.provider_id,
      authorId: created.author_id,
      authorName: authorRow.rows[0]?.author_name ?? '',
      category: created.category,
      body: created.body,
      pinned: created.pinned,
      createdAt: created.created_at.toISOString(),
      updatedAt: created.updated_at.toISOString(),
    };
  });
}

export async function updateProviderNote(
  noteId: string,
  authorId: string,
  isSuperAdmin: boolean,
  patch: { body?: string; category?: NoteCategory; pinned?: boolean },
): Promise<void> {
  const existing = await db.query<{ author_id: string }>(
    `SELECT author_id FROM provider_admin_notes WHERE id = $1`,
    [noteId],
  );
  const row = existing.rows[0];
  if (!row) throw createAppError('Note not found.', 404);
  if (row.author_id !== authorId && !isSuperAdmin) {
    throw createAppError('You can only edit your own notes.', 403);
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.body !== undefined) {
    if (!patch.body.trim()) throw createAppError('Note body required.', 400);
    values.push(patch.body.trim());
    sets.push(`body = $${values.length}`);
  }
  if (patch.category !== undefined) {
    if (!isNoteCategory(patch.category)) throw createAppError('Invalid category.', 400);
    values.push(patch.category);
    sets.push(`category = $${values.length}`);
  }
  if (patch.pinned !== undefined) {
    values.push(patch.pinned);
    sets.push(`pinned = $${values.length}`);
  }
  if (sets.length === 0) return;

  values.push(noteId);
  await db.query(
    `UPDATE provider_admin_notes
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}`,
    values,
  );
}

export async function deleteProviderNote(
  noteId: string,
  authorId: string,
  isSuperAdmin: boolean,
  reason?: string,
): Promise<void> {
  // Phase 14 Dispatch 06 — Bug 80. Pre-D06 this was a hard DELETE with
  // NO audit. Now: soft delete (UPDATE deleted_at/deleted_by/deleted_reason
  // from migration 076) + admin_actions audit in ONE transaction. The
  // FK from admin_actions.target_id back to the note row remains valid
  // since the row still exists, just with deleted_at set.
  await db.transaction(async (client) => {
    const existing = await client.query<{
      author_id: string;
      provider_id: string;
      deleted_at: Date | null;
    }>(
      `SELECT author_id, provider_id, deleted_at FROM provider_admin_notes WHERE id = $1`,
      [noteId],
    );
    const row = existing.rows[0];
    if (!row) throw createAppError('Note not found.', 404);
    if (row.deleted_at) throw createAppError('Note already deleted.', 409);
    if (row.author_id !== authorId && !isSuperAdmin) {
      throw createAppError('You can only delete your own notes.', 403);
    }

    const trimmedReason = (reason ?? '').trim();
    // BUG-PHASE164-01 fix — pre-fix the trimmed reason had no length
    // cap. Column is TEXT (deleted_reason; migration 076), unbounded.
    // Same defense-in-depth pattern as Phase 152-163. Cap at 1000.
    if (trimmedReason.length > 1000) {
      throw createAppError('reason must be ≤ 1000 characters.', 400);
    }
    await client.query(
      `UPDATE provider_admin_notes
          SET deleted_at = NOW(),
              deleted_by = $2,
              deleted_reason = $3
        WHERE id = $1 AND deleted_at IS NULL`,
      [noteId, authorId, trimmedReason || null],
    );

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'provider_note_deleted', 'provider_note', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        authorId,
        noteId,
        JSON.stringify({ providerId: row.provider_id, originalAuthorId: row.author_id }),
        trimmedReason ? trimmedReason.slice(0, 500) : 'soft delete by note author',
        trimmedReason || null,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record provider_note_deleted audit.', 500);
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Profile / status / tier mutations (super-admin)
// ─────────────────────────────────────────────────────────────────

export async function updateProviderProfile(
  providerId: string,
  patch: { businessName?: string; description?: string; serviceRadiusKm?: number },
  adminUserId: string,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const auditPatch: Record<string, unknown> = {};

  if (patch.businessName !== undefined) {
    if (!patch.businessName.trim()) throw createAppError('businessName cannot be empty.', 400);
    const v = patch.businessName.trim();
    // BUG-PHASE189-01 fix — pre-fix businessName had no max-length cap.
    // Column is VARCHAR(200) (migration 002), so Postgres would reject
    // an overlong string with a 5xx string-data-right-truncation error
    // rather than a clean 400. Same defense-in-depth pattern as Phase
    // 152-168 + 179-181 + 188.
    if (v.length > 200) {
      throw createAppError('businessName must be ≤ 200 characters.', 400);
    }
    values.push(v);
    sets.push(`business_name = $${values.length}`);
    auditPatch.businessName = v;
  }
  if (patch.description !== undefined) {
    // BUG-PHASE189-01 fix — pre-fix description had no max-length cap.
    // Column is TEXT (migration 002) — unbounded by Postgres. Cap at
    // 5000 (free-form provider description; matches the dispute /
    // wallet-adjustment cap shape).
    if (patch.description.length > 5000) {
      throw createAppError('description must be ≤ 5000 characters.', 400);
    }
    values.push(patch.description);
    sets.push(`description = $${values.length}`);
    auditPatch.description = patch.description;
  }
  if (patch.serviceRadiusKm !== undefined) {
    const n = Math.max(1, Math.min(200, Math.floor(patch.serviceRadiusKm)));
    values.push(n);
    sets.push(`service_radius_km = $${values.length}`);
    auditPatch.serviceRadiusKm = n;
  }
  if (sets.length === 0) return;

  values.push(providerId);

  // Phase 14 Dispatch 06 — Bug 79. Pre-D06 this was a top-level db.query
  // with NO audit. Now: profile UPDATE + admin_actions audit in ONE
  // transaction. The audit details capture the patch fields applied so
  // diff history is reconstructible.
  await db.transaction(async (client) => {
    // Snapshot the previous values so the audit row records before/after.
    const before = await client.query<{
      business_name: string | null;
      description: string | null;
      service_radius_km: number | null;
    }>(
      `SELECT business_name, description, service_radius_km FROM providers WHERE id = $1 FOR UPDATE`,
      [providerId],
    );
    if (before.rows.length === 0) throw createAppError('Provider not found.', 404);

    const result = await client.query(
      `UPDATE providers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values,
    );
    if (result.rowCount === 0) throw createAppError('Provider not found.', 404);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'provider_profile_updated', 'provider', $2, $3::jsonb, $4)
       RETURNING id`,
      [
        adminUserId,
        providerId,
        JSON.stringify({
          patch: auditPatch,
          previous: {
            businessName: before.rows[0]?.business_name,
            description: before.rows[0]?.description,
            serviceRadiusKm: before.rows[0]?.service_radius_km,
          },
        }),
        `Profile fields updated: ${Object.keys(auditPatch).join(', ')}`,
      ],
    );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record provider_profile_updated audit.', 500);
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Wallet adjustment (SACRED: writes wallet + paired transaction in TX)
// ─────────────────────────────────────────────────────────────────

export interface WalletAdjustmentResult {
  walletId: string;
  newAvailableBalance: number;
  transactionId: string;
}

export async function adjustProviderWallet(
  providerId: string,
  deltaAmount: number,
  reason: string,
  adminUserId: string,
): Promise<WalletAdjustmentResult> {
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
    const walletResult = await client.query<{
      id: string;
      available_balance: string;
    }>(
      `SELECT w.id, w.available_balance
         FROM wallets w
         JOIN providers p ON p.user_id = w.user_id
        WHERE p.id = $1 AND w.type = 'provider'
        FOR UPDATE`,
      [providerId],
    );
    const wallet = walletResult.rows[0];
    if (!wallet) throw createAppError('Provider wallet not found.', 404);

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
        `admin_adjustment:${adminUserId}`,
      ],
    );
    const txId = txResult.rows[0]?.id;
    if (!txId) throw createAppError('Failed to record adjustment transaction.', 500);

    // Phase 14 Dispatch 06 — Bug 78. Pre-D06 there was NO admin_actions
    // audit row for super-admin wallet adjustments. The wallet_transactions
    // ledger row recorded the money movement but provided no link back to
    // the actor's identity beyond the embedded reference_id string.
    // Now: insert admin_actions inside the SAME transaction so audit and
    // money are atomic. New verb `provider_wallet_adjusted` introduced by
    // migration 075.
    const actionResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'provider_wallet_adjusted', 'provider', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminUserId,
        providerId,
        JSON.stringify({
          walletId: wallet.id,
          deltaAmount,
          previousBalance: currentBalance,
          newBalance,
          walletTransactionId: txId,
        }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    const adminActionId = actionResult.rows[0]?.id;
    if (!adminActionId) {
      throw createAppError('Failed to record provider wallet adjustment audit.', 500);
    }

    logger.info('Provider wallet adjustment', {
      providerId,
      walletId: wallet.id,
      deltaAmount,
      newBalance,
      adminUserId,
      adminActionId,
      reason: trimmedReason,
    });

    return {
      walletId: wallet.id,
      newAvailableBalance: newBalance,
      transactionId: txId,
    };
  });
}
