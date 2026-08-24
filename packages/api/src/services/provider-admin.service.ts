/**
 * Phase 05 — Provider 360 admin service.
 * Read + write actions for the admin Provider Detail page (7 tabs).
 *
 * Sacred-file note: this service DOES touch wallet balances via
 * `adjustProviderWallet` (super-admin manual adjustment). That single function
 * is gated by super-admin role + always writes a paired wallet_transaction
 * within a transaction so money conservation holds. All other functions are
 * read-only or write provider review metadata, notes, or certification state.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as kycDocumentService from './kyc-document.service';
import * as uploadService from './upload.service';
import * as notificationService from './notification.service';
import { getMaxProviderServiceRadiusKm } from './settings.service';
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
  /** @deprecated Use services. Retained for older admin clients. */
  categories: { id: string; name: string; basePrice: number | null }[];
  services: Array<{
    id: string;
    name: string;
    categoryName: string;
    pricingType: string;
    basePrice: number | null;
    hourlyRate: number | null;
    unitLabel: string | null;
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
  }>;
  serviceAreas: { id: string; name: string; isPrimary: boolean }[];
  certifications: ProviderCertification[];
  portfolio: ProviderPortfolioItem[];
}

export interface ProviderPortfolioItem {
  id: string;
  imageUrl: string;
  caption: string | null;
  customerConsentConfirmedAt: string | null;
  createdAt: string;
}

export interface ProviderCertification {
  id: string;
  name: string;
  issuingBody: string;
  certificateNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  hasDocument: boolean;
  documentUrl: string | null;
  createdAt: string;
}

interface ProviderCertificationRow {
  id: string;
  provider_id: string;
  name: string;
  issuing_body: string;
  certificate_number: string | null;
  certificate_url: string | null;
  issued_date: string | Date | null;
  expiry_date: string | Date | null;
  is_verified: boolean;
  verified_at: Date | null;
  created_at: Date;
}

function certificationDateKey(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] ?? null;
}

function formatProviderCertification(row: ProviderCertificationRow): ProviderCertification {
  return {
    id: row.id,
    name: row.name,
    issuingBody: row.issuing_body,
    certificateNumber: row.certificate_number,
    issuedDate: certificationDateKey(row.issued_date),
    expiryDate: certificationDateKey(row.expiry_date),
    isVerified: row.is_verified,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    hasDocument: Boolean(row.certificate_url),
    documentUrl: row.certificate_url
      ? `/api/v1/admin/providers/${row.provider_id}/certifications/${row.id}/document`
      : null,
    createdAt: row.created_at.toISOString(),
  };
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

export async function getProviderProfile(
  providerId: string,
  actorRole: string,
): Promise<ProviderProfile> {
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

  const [categoriesResult, areasResult, certificationsResult, portfolioResult] = await Promise.all([
    db.query<{
      id: string;
      name: string;
      category_id: string;
      category_name: string;
      pricing_type: string;
      catalog_base_price: number | null;
      legacy_provider_base_price: number | null;
      hourly_rate: number | null;
      unit_label: string | null;
      unit_price: number | null;
      min_price: number | null;
      max_price: number | null;
    }>(
      `SELECT ssc.id, ssc.name, sc.id AS category_id, sc.name AS category_name,
              ssc.pricing_type, ssc.base_price AS catalog_base_price,
              ps.base_price AS legacy_provider_base_price, ssc.hourly_rate,
              ssc.unit_label, ssc.unit_price, ssc.min_price, ssc.max_price
         FROM provider_services ps
         JOIN service_subcategories ssc ON ssc.id = ps.subcategory_id
         JOIN service_categories sc ON sc.id = ssc.category_id
        WHERE ps.provider_id = $1 AND ps.is_active = TRUE
        ORDER BY sc.name, ssc.name`,
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
    db.query<ProviderCertificationRow>(
      `SELECT id, provider_id, name, issuing_body, certificate_number,
              certificate_url, issued_date, expiry_date, is_verified,
              verified_at, created_at
         FROM provider_certifications
        WHERE provider_id = $1 AND is_active = TRUE
        ORDER BY is_verified DESC, created_at DESC`,
      [providerId],
    ),
    db.query<{
      id: string;
      image_url: string;
      caption: string | null;
      customer_consent_confirmed_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, image_url, caption, customer_consent_confirmed_at, created_at
         FROM provider_portfolios
        WHERE provider_id = $1 AND is_active = TRUE
        ORDER BY display_order ASC, created_at DESC`,
      [providerId],
    ),
  ]);

  // D25: only super_admin sees raw contact by default; everyone else (INCLUDING
  // dpo) gets masked values plus an audit-logged reveal, matching pii-mask.ts
  // maskPiiForRole (dpo: masked phone/email). The separate activity IP/UA
  // masking is what treats dpo like super_admin, not contact.
  const contactMasked = actorRole !== 'super_admin';

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
        ? kycDocumentService.kycProxyPath('admin', 'nbi_clearance', p.id)
        : null,
      nbiExpiryDate: p.nbi_expiry_date ? p.nbi_expiry_date.toISOString().slice(0, 10) : null,
      nbiExpiryNotified: p.nbi_expiry_notified,
      avatarUrl: p.avatar_url,
      governmentIdUrl: p.government_id_front_url
        ? kycDocumentService.kycProxyPath('admin', 'government_id_front', p.id)
        : null,
      governmentIdBackUrl: p.government_id_back_url
        ? kycDocumentService.kycProxyPath('admin', 'government_id_back', p.id)
        : null,
      selfieUrl: p.selfie_url ? kycDocumentService.kycProxyPath('admin', 'selfie', p.id) : null,
    },
    // E16 containment: provider_services.base_price is a dormant legacy field.
    // Provider 360 must show the same catalog prices booking creation uses.
    // Keep the old categories key temporarily so older admin builds do not
    // break while the current UI reads the complete services projection.
    categories: categoriesResult.rows.map((r) => ({
      id: r.category_id,
      name: r.category_name,
      basePrice: r.pricing_type === 'fixed' && r.catalog_base_price !== null
        ? Number(r.catalog_base_price)
        : null,
    })),
    services: categoriesResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      categoryName: r.category_name,
      pricingType: r.pricing_type,
      basePrice: r.catalog_base_price !== null ? Number(r.catalog_base_price) : null,
      hourlyRate: r.hourly_rate !== null ? Number(r.hourly_rate) : null,
      unitLabel: r.unit_label,
      unitPrice: r.unit_price !== null ? Number(r.unit_price) : null,
      minPrice: r.min_price !== null ? Number(r.min_price) : null,
      maxPrice: r.max_price !== null ? Number(r.max_price) : null,
    })),
    serviceAreas: areasResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      isPrimary: r.is_primary,
    })),
    certifications: certificationsResult.rows.map(formatProviderCertification),
    portfolio: portfolioResult.rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      caption: row.caption,
      customerConsentConfirmedAt: row.customer_consent_confirmed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

export async function reviewProviderCertification(params: {
  providerId: string;
  certId: string;
  adminId: string;
  isVerified: boolean;
  reason?: string;
}): Promise<ProviderCertification> {
  if (!params.isVerified && (!params.reason || params.reason.trim().length < 3)) {
    throw createAppError('A reason is required when removing verification.', 400);
  }

  const reviewed = await db.transaction(async (client) => {
    const currentResult = await client.query<ProviderCertificationRow & { owner_user_id: string }>(
      `SELECT pc.*, p.user_id AS owner_user_id
         FROM provider_certifications pc
         JOIN providers p ON p.id = pc.provider_id
        WHERE pc.id = $1 AND pc.provider_id = $2 AND pc.is_active = TRUE
        FOR UPDATE`,
      [params.certId, params.providerId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Certification not found for this provider.', 404);

    if (params.isVerified) {
      if (!current.certificate_url) {
        throw createAppError('A certificate document is required before verification.', 409);
      }
      const expiryDate = certificationDateKey(current.expiry_date);
      const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      if (expiryDate && expiryDate < todayManila) {
        throw createAppError('An expired certification cannot be verified.', 409);
      }
    }

    const updatedResult = await client.query<ProviderCertificationRow>(
      `UPDATE provider_certifications
          SET is_verified = $1,
              verified_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
              verified_by = CASE WHEN $1 THEN $2 ELSE NULL END,
              updated_at = NOW()
        WHERE id = $3 AND provider_id = $4
        RETURNING *`,
      [params.isVerified, params.adminId, params.certId, params.providerId],
    );
    return { row: updatedResult.rows[0]!, ownerUserId: current.owner_user_id };
  });

  try {
    await notificationService.createPushNotification({
      userId: reviewed.ownerUserId,
      type: params.isVerified ? 'provider_certification_verified' : 'provider_certification_unverified',
      title: params.isVerified ? 'Certification verified' : 'Certification needs attention',
      body: params.isVerified
        ? `${reviewed.row.name} is verified and can now appear on your customer profile.`
        : `${reviewed.row.name} is no longer verified. ${params.reason!.trim()}`,
      data: { certificationId: params.certId, route: '/provider/certifications' },
    });
  } catch (error) {
    logger.error('Provider certification review notification failed (non-fatal)', {
      providerId: params.providerId,
      certId: params.certId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return formatProviderCertification(reviewed.row);
}

export async function getProviderCertificationDocumentStream(
  providerId: string,
  certId: string,
): Promise<uploadService.ObjectStream> {
  const result = await db.query<{ certificate_url: string | null }>(
    `SELECT certificate_url
       FROM provider_certifications
      WHERE id = $1 AND provider_id = $2 AND is_active = TRUE`,
    [certId, providerId],
  );
  const certificateUrl = result.rows[0]?.certificate_url;
  if (!certificateUrl) throw createAppError('Certificate document not found.', 404);
  return uploadService.getObjectStream(certificateUrl);
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
  return db.transaction(async (client) => {
    const result = await client.query<{ phone: string; email: string | null }>(
      `SELECT u.phone, u.email
         FROM providers pr
         JOIN users u ON u.id = pr.user_id
        WHERE pr.id = $1`,
      [providerId],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Provider not found.', 404);
    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'pii_reveal', 'provider', $2, $3::jsonb)`,
      [adminId, providerId, JSON.stringify({ fields: ['phone', 'email'] })],
    );
    logger.info('Provider contact revealed', { adminId, providerId });
    return { phone: row.phone, email: row.email };
  });
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

export async function setReviewVisibility(reviewId: string, isVisible: boolean): Promise<void> {
  const result = await db.query(
    `UPDATE reviews SET is_visible = $1, updated_at = NOW() WHERE id = $2`,
    [isVisible, reviewId],
  );
  if (result.rowCount === 0) throw createAppError('Review not found.', 404);
}

export async function setReviewAdminResponse(reviewId: string, response: string): Promise<void> {
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
    }>(`SELECT author_id, provider_id, deleted_at FROM provider_admin_notes WHERE id = $1`, [
      noteId,
    ]);
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
    const maxRadiusKm = await getMaxProviderServiceRadiusKm();
    if (
      !Number.isInteger(patch.serviceRadiusKm)
      || patch.serviceRadiusKm < 1
      || patch.serviceRadiusKm > maxRadiusKm
    ) {
      throw createAppError(`serviceRadiusKm must be an integer from 1 to ${maxRadiusKm}.`, 400);
    }
    const n = patch.serviceRadiusKm;
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
