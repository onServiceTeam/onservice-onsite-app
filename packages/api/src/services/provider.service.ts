import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface ProviderRow {
  id: string;
  user_id: string;
  business_name: string;
  tier: string;
  status: string;
  bio: string | null;
  rating: string;
  total_jobs: number;
  acceptance_rate: string;
  response_time_minutes: number | null;
  years_experience: number | null;
  service_radius_km: number;
  is_available: boolean;
  latitude: string | null;
  longitude: string | null;
  city: string | null;
  province: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ProviderServiceRow {
  id: string;
  provider_id: string;
  subcategory_id: string;
  base_price: string | null;
  is_active: boolean;
  created_at: Date;
}

interface AvailabilityRow {
  id: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  created_at: Date;
}

interface SubcategoryNameRow {
  id: string;
  name: string;
  category_id: string;
}

export async function getProviderByUserId(userId: string): Promise<ProviderRow> {
  const result = await db.query<ProviderRow>(
    `SELECT * FROM providers WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) throw createAppError('Provider profile not found.', 404);
  return result.rows[0]!;
}

export async function getProviderById(providerId: string): Promise<ProviderRow & { first_name?: string; last_name?: string }> {
  const result = await db.query<ProviderRow & { first_name?: string; last_name?: string }>(
    `SELECT p.*, u.first_name, u.last_name
     FROM providers p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    [providerId],
  );
  if (result.rows.length === 0) throw createAppError('Provider not found.', 404);
  return result.rows[0]!;
}

export async function updateProfile(
  providerId: string,
  data: {
    bio?: string;
    yearsExperience?: number;
    serviceRadiusKm?: number;
    latitude?: number;
    longitude?: number;
    isAvailable?: boolean;
  },
): Promise<ProviderRow> {
  const setClauses: string[] = [];
  const values: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (data.bio !== undefined) {
    setClauses.push(`bio = $${paramIndex++}`);
    values.push(data.bio);
  }
  if (data.yearsExperience !== undefined) {
    setClauses.push(`years_experience = $${paramIndex++}`);
    values.push(data.yearsExperience);
  }
  if (data.serviceRadiusKm !== undefined) {
    setClauses.push(`service_radius_km = $${paramIndex++}`);
    values.push(data.serviceRadiusKm);
  }
  if (data.latitude !== undefined) {
    setClauses.push(`latitude = $${paramIndex++}`);
    values.push(data.latitude);
  }
  if (data.longitude !== undefined) {
    setClauses.push(`longitude = $${paramIndex++}`);
    values.push(data.longitude);
  }
  if (data.isAvailable !== undefined) {
    setClauses.push(`is_available = $${paramIndex++}`);
    values.push(data.isAvailable);
  }

  if (setClauses.length === 0) throw createAppError('No fields to update.', 400);

  setClauses.push(`updated_at = NOW()`);
  values.push(providerId);

  const result = await db.query<ProviderRow>(
    `UPDATE providers SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values,
  );

  if (result.rows.length === 0) throw createAppError('Provider not found.', 404);

  logger.info('Provider profile updated', { providerId });
  return result.rows[0]!;
}

export async function setAvailability(
  providerId: string,
  isAvailable: boolean,
): Promise<ProviderRow> {
  const result = await db.query<ProviderRow>(
    `UPDATE providers SET is_available = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [isAvailable, providerId],
  );
  if (result.rows.length === 0) throw createAppError('Provider not found.', 404);
  return result.rows[0]!;
}

export async function getProviderServices(providerId: string): Promise<(ProviderServiceRow & { subcategory_name: string })[]> {
  const result = await db.query<ProviderServiceRow & { subcategory_name: string }>(
    `SELECT ps.*, sc.name as subcategory_name
     FROM provider_services ps
     JOIN service_subcategories sc ON sc.id = ps.subcategory_id
     WHERE ps.provider_id = $1 AND ps.is_active = TRUE
     ORDER BY sc.name ASC`,
    [providerId],
  );
  return result.rows;
}

export async function addProviderService(
  providerId: string,
  subcategoryId: string,
  basePrice?: number,
): Promise<ProviderServiceRow> {
  const subcat = await db.query<SubcategoryNameRow>(
    `SELECT id, name, category_id FROM service_subcategories WHERE id = $1 AND is_active = TRUE`,
    [subcategoryId],
  );
  if (subcat.rows.length === 0) throw createAppError('Service subcategory not found or inactive.', 404);

  const result = await db.query<ProviderServiceRow>(
    `INSERT INTO provider_services (provider_id, subcategory_id, category_id, base_price)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider_id, subcategory_id) DO UPDATE SET is_active = TRUE, base_price = COALESCE($4, provider_services.base_price)
     RETURNING *`,
    [providerId, subcategoryId, subcat.rows[0]!.category_id, basePrice ?? null],
  );

  logger.info('Provider service added', { providerId, subcategoryId });
  return result.rows[0]!;
}

export async function removeProviderService(
  providerId: string,
  subcategoryId: string,
): Promise<void> {
  const result = await db.query(
    `UPDATE provider_services SET is_active = FALSE WHERE provider_id = $1 AND subcategory_id = $2`,
    [providerId, subcategoryId],
  );
  if (result.rowCount === 0) throw createAppError('Provider service not found.', 404);
}

export async function getSchedule(providerId: string): Promise<AvailabilityRow[]> {
  const result = await db.query<AvailabilityRow>(
    `SELECT * FROM provider_availability WHERE provider_id = $1 ORDER BY day_of_week ASC, start_time ASC`,
    [providerId],
  );
  return result.rows;
}

export async function setSchedule(
  providerId: string,
  schedule: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>,
): Promise<AvailabilityRow[]> {
  return db.transaction(async (client) => {
    await client.query(
      `DELETE FROM provider_availability WHERE provider_id = $1`,
      [providerId],
    );

    const rows: AvailabilityRow[] = [];
    for (const slot of schedule) {
      const result = await client.query<AvailabilityRow>(
        `INSERT INTO provider_availability (provider_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [providerId, slot.dayOfWeek, slot.startTime, slot.endTime, slot.isAvailable],
      );
      rows.push(result.rows[0]!);
    }

    logger.info('Provider schedule updated', { providerId, slots: schedule.length });
    return rows;
  });
}

export interface ProviderApplicationInput {
  businessName: string;
  categoryIds: string[];
  serviceRadiusKm: number;
  latitude: number;
  longitude: number;
  city: string;
  province: string;
  governmentIdFrontUrl: string;
  governmentIdBackUrl: string;
  nbiClearanceUrl: string;
  selfieUrl: string;
}

export async function createProviderApplication(
  userId: string,
  input: ProviderApplicationInput,
): Promise<ProviderRow> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM providers WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    throw createAppError('A provider application already exists for this account.', 409);
  }

  return db.transaction(async (client) => {
    await client.query(
      `UPDATE users SET role = 'provider' WHERE id = $1`,
      [userId],
    );

    const providerResult = await client.query<ProviderRow>(
      `INSERT INTO providers (
        user_id, business_name, service_radius_km, latitude, longitude,
        city, province, government_id_front_url, government_id_back_url,
        nbi_clearance_url, selfie_url, ic_agreement_accepted_at, applied_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), 'pending')
      RETURNING *`,
      [
        userId, input.businessName, input.serviceRadiusKm,
        input.latitude, input.longitude, input.city, input.province,
        input.governmentIdFrontUrl, input.governmentIdBackUrl,
        input.nbiClearanceUrl, input.selfieUrl,
      ],
    );
    const provider = providerResult.rows[0]!;

    for (const catId of input.categoryIds) {
      await client.query(
        `INSERT INTO provider_services (provider_id, category_id, is_active) VALUES ($1, $2, TRUE)
         ON CONFLICT DO NOTHING`,
        [provider.id, catId],
      );
    }

    logger.info('Provider application submitted', { userId, providerId: provider.id, categories: input.categoryIds.length });
    return provider;
  });
}

export async function getApplicationStatus(userId: string): Promise<{ status: string; rejectionReason: string | null } | null> {
  const result = await db.query<{ status: string; rejection_reason: string | null }>(
    `SELECT status, rejection_reason FROM providers WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  return { status: result.rows[0]!.status, rejectionReason: result.rows[0]!.rejection_reason };
}

export function formatProvider(p: ProviderRow): Record<string, unknown> {
  return {
    id: p.id,
    userId: p.user_id,
    businessName: p.business_name,
    tier: p.tier,
    status: p.status,
    bio: p.bio,
    rating: Number(p.rating),
    totalJobs: p.total_jobs,
    acceptanceRate: Number(p.acceptance_rate),
    responseTimeMinutes: p.response_time_minutes,
    yearsExperience: p.years_experience,
    serviceRadiusKm: p.service_radius_km,
    isAvailable: p.is_available,
    latitude: p.latitude ? Number(p.latitude) : null,
    longitude: p.longitude ? Number(p.longitude) : null,
    city: p.city,
    province: p.province,
    createdAt: p.created_at,
  };
}

export function formatProviderService(ps: ProviderServiceRow & { subcategory_name?: string }): Record<string, unknown> {
  return {
    id: ps.id,
    providerId: ps.provider_id,
    subcategoryId: ps.subcategory_id,
    subcategoryName: ps.subcategory_name ?? null,
    basePrice: ps.base_price ? Number(ps.base_price) : null,
    isActive: ps.is_active,
  };
}

export function formatScheduleSlot(s: AvailabilityRow): Record<string, unknown> {
  return {
    id: s.id,
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    isAvailable: s.is_available,
  };
}

// --- Portfolio ---

interface PortfolioRow {
  id: string;
  provider_id: string;
  image_url: string;
  caption: string | null;
  category_id: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getPortfolio(providerId: string): Promise<PortfolioRow[]> {
  const result = await db.query<PortfolioRow>(
    `SELECT * FROM provider_portfolios WHERE provider_id = $1 AND is_active = TRUE ORDER BY display_order ASC, created_at DESC`,
    [providerId],
  );
  return result.rows;
}

export async function addPortfolioItem(
  providerId: string,
  data: { imageUrl: string; caption?: string; categoryId?: string; displayOrder?: number },
): Promise<PortfolioRow> {
  const result = await db.query<PortfolioRow>(
    `INSERT INTO provider_portfolios (provider_id, image_url, caption, category_id, display_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [providerId, data.imageUrl, data.caption ?? null, data.categoryId ?? null, data.displayOrder ?? 0],
  );
  logger.info('Portfolio item added', { providerId, itemId: result.rows[0]!.id });
  return result.rows[0]!;
}

export async function updatePortfolioItem(
  providerId: string,
  itemId: string,
  data: { caption?: string; displayOrder?: number },
): Promise<PortfolioRow> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  if (data.caption !== undefined) {
    setClauses.push(`caption = $${paramIndex++}`);
    values.push(data.caption);
  }
  if (data.displayOrder !== undefined) {
    setClauses.push(`display_order = $${paramIndex++}`);
    values.push(data.displayOrder);
  }

  values.push(itemId, providerId);
  const result = await db.query<PortfolioRow>(
    `UPDATE provider_portfolios SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND provider_id = $${paramIndex} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) throw createAppError('Portfolio item not found.', 404);
  return result.rows[0]!;
}

export async function removePortfolioItem(providerId: string, itemId: string): Promise<void> {
  const result = await db.query(
    `UPDATE provider_portfolios SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND provider_id = $2`,
    [itemId, providerId],
  );
  if (result.rowCount === 0) throw createAppError('Portfolio item not found.', 404);
}

export function formatPortfolioItem(p: PortfolioRow): Record<string, unknown> {
  return {
    id: p.id,
    imageUrl: p.image_url,
    caption: p.caption,
    categoryId: p.category_id,
    displayOrder: p.display_order,
    createdAt: p.created_at,
  };
}

// --- Certifications ---

interface CertificationRow {
  id: string;
  provider_id: string;
  name: string;
  issuing_body: string;
  certificate_number: string | null;
  certificate_url: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  is_verified: boolean;
  verified_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getCertifications(providerId: string): Promise<CertificationRow[]> {
  const result = await db.query<CertificationRow>(
    `SELECT * FROM provider_certifications WHERE provider_id = $1 AND is_active = TRUE ORDER BY is_verified DESC, created_at DESC`,
    [providerId],
  );
  return result.rows;
}

export async function addCertification(
  providerId: string,
  data: {
    name: string;
    issuingBody?: string;
    certificateNumber?: string;
    certificateUrl?: string;
    issuedDate?: string;
    expiryDate?: string;
  },
): Promise<CertificationRow> {
  const result = await db.query<CertificationRow>(
    `INSERT INTO provider_certifications (provider_id, name, issuing_body, certificate_number, certificate_url, issued_date, expiry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      providerId,
      data.name,
      data.issuingBody ?? 'TESDA',
      data.certificateNumber ?? null,
      data.certificateUrl ?? null,
      data.issuedDate ?? null,
      data.expiryDate ?? null,
    ],
  );
  logger.info('Certification added', { providerId, certId: result.rows[0]!.id });
  return result.rows[0]!;
}

export async function updateCertification(
  providerId: string,
  certId: string,
  data: {
    name?: string;
    issuingBody?: string;
    certificateNumber?: string;
    certificateUrl?: string;
    issuedDate?: string;
    expiryDate?: string;
  },
): Promise<CertificationRow> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: (string | null)[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); values.push(data.name); }
  if (data.issuingBody !== undefined) { setClauses.push(`issuing_body = $${paramIndex++}`); values.push(data.issuingBody); }
  if (data.certificateNumber !== undefined) { setClauses.push(`certificate_number = $${paramIndex++}`); values.push(data.certificateNumber); }
  if (data.certificateUrl !== undefined) { setClauses.push(`certificate_url = $${paramIndex++}`); values.push(data.certificateUrl); }
  if (data.issuedDate !== undefined) { setClauses.push(`issued_date = $${paramIndex++}`); values.push(data.issuedDate); }
  if (data.expiryDate !== undefined) { setClauses.push(`expiry_date = $${paramIndex++}`); values.push(data.expiryDate); }

  values.push(certId, providerId);
  const result = await db.query<CertificationRow>(
    `UPDATE provider_certifications SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND provider_id = $${paramIndex} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) throw createAppError('Certification not found.', 404);
  return result.rows[0]!;
}

export async function removeCertification(providerId: string, certId: string): Promise<void> {
  const result = await db.query(
    `UPDATE provider_certifications SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND provider_id = $2`,
    [certId, providerId],
  );
  if (result.rowCount === 0) throw createAppError('Certification not found.', 404);
}

export function formatCertification(c: CertificationRow): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    issuingBody: c.issuing_body,
    certificateNumber: c.certificate_number,
    certificateUrl: c.certificate_url,
    issuedDate: c.issued_date,
    expiryDate: c.expiry_date,
    isVerified: c.is_verified,
    verifiedAt: c.verified_at,
    createdAt: c.created_at,
  };
}

// --- Suki count (public) ---

export async function getSukiCount(providerId: string): Promise<number> {
  interface CountRow { count: string }
  const result = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM suki_memberships WHERE provider_id = $1 AND tier != 'new'`,
    [providerId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

// --- Availability overrides (US-P008) ---

interface OverrideRow {
  id: string;
  provider_id: string;
  override_date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getAvailabilityOverrides(
  providerId: string,
  fromDate?: string,
  toDate?: string,
): Promise<OverrideRow[]> {
  let query = `SELECT * FROM provider_availability_overrides WHERE provider_id = $1`;
  const params: (string)[] = [providerId];
  let idx = 2;
  if (fromDate) { query += ` AND override_date >= $${idx++}`; params.push(fromDate); }
  if (toDate) { query += ` AND override_date <= $${idx}`; params.push(toDate); }
  query += ` ORDER BY override_date ASC`;
  const result = await db.query<OverrideRow>(query, params);
  return result.rows;
}

export async function addAvailabilityOverride(
  providerId: string,
  data: { overrideDate: string; isAvailable: boolean; startTime?: string; endTime?: string; reason?: string },
): Promise<OverrideRow> {
  await db.query(
    `DELETE FROM provider_availability_overrides WHERE provider_id = $1 AND override_date = $2`,
    [providerId, data.overrideDate],
  );
  const result = await db.query<OverrideRow>(
    `INSERT INTO provider_availability_overrides (provider_id, override_date, is_available, start_time, end_time, reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [providerId, data.overrideDate, data.isAvailable, data.startTime ?? null, data.endTime ?? null, data.reason ?? null],
  );
  logger.info('Availability override set', { providerId, date: data.overrideDate, available: data.isAvailable });
  return result.rows[0]!;
}

export async function removeAvailabilityOverride(providerId: string, overrideId: string): Promise<void> {
  const result = await db.query(
    `DELETE FROM provider_availability_overrides WHERE id = $1 AND provider_id = $2`,
    [overrideId, providerId],
  );
  if (result.rowCount === 0) throw createAppError('Override not found.', 404);
}

export function formatOverride(o: OverrideRow): Record<string, unknown> {
  return {
    id: o.id,
    overrideDate: o.override_date,
    isAvailable: o.is_available,
    startTime: o.start_time,
    endTime: o.end_time,
    reason: o.reason,
    createdAt: o.created_at,
  };
}

export async function toggleInstantAvailability(providerId: string, isAvailable: boolean): Promise<void> {
  await db.query(
    `UPDATE providers SET is_available = $1, updated_at = NOW() WHERE id = $2`,
    [isAvailable, providerId],
  );
  logger.info('Instant availability toggled', { providerId, isAvailable });
}

export async function getInstantAvailability(providerId: string): Promise<boolean> {
  const result = await db.query<{ is_available: boolean }>(
    `SELECT is_available FROM providers WHERE id = $1`,
    [providerId],
  );
  return result.rows[0]?.is_available ?? false;
}

// --- Provider upcoming jobs (calendar view) ---

interface UpcomingJobRow {
  id: string;
  status: string;
  scheduled_at: Date;
  service_name: string;
  customer_name: string;
  total_amount: string;
  address_text: string;
  latitude: string | null;
  longitude: string | null;
}

export async function getUpcomingJobs(providerId: string, fromDate: string, toDate: string): Promise<UpcomingJobRow[]> {
  const result = await db.query<UpcomingJobRow>(
    `SELECT
       b.id, b.status, b.scheduled_at, b.total_amount,
       COALESCE(sc.name, 'Service') as service_name,
       COALESCE(u.first_name || ' ' || u.last_name, 'Customer') as customer_name,
       b.address as address_text,
       b.latitude, b.longitude
     FROM bookings b
     LEFT JOIN service_subcategories sc ON sc.id = b.subcategory_id
     LEFT JOIN users u ON u.id = b.customer_id
     WHERE b.provider_id = $1
       AND b.scheduled_at >= $2::timestamptz
       AND b.scheduled_at <= $3::timestamptz
       AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
     ORDER BY b.scheduled_at ASC`,
    [providerId, fromDate, toDate],
  );
  return result.rows;
}

export function formatUpcomingJob(j: UpcomingJobRow): Record<string, unknown> {
  return {
    id: j.id,
    status: j.status,
    scheduledAt: j.scheduled_at,
    serviceName: j.service_name,
    customerName: j.customer_name,
    totalAmount: Number(j.total_amount),
    address: j.address_text,
    latitude: j.latitude ? Number(j.latitude) : null,
    longitude: j.longitude ? Number(j.longitude) : null,
  };
}

// --- Tier Progression (US-P016) ---

interface TierRequirement {
  tier: string;
  minJobs: number;
  minRating: number;
  requiresCertification: boolean;
  requiresZeroDisputes: boolean;
  commission: number;
  benefits: string[];
}

const TIER_LADDER: TierRequirement[] = [
  {
    tier: 'new',
    minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false,
    commission: 15,
    benefits: ['Access to job marketplace', 'Secure escrow payments', 'Basic profile listing'],
  },
  {
    tier: 'verified',
    minJobs: 5, minRating: 4.0, requiresCertification: false, requiresZeroDisputes: false,
    commission: 13,
    benefits: ['Priority in search results', 'Verified badge on profile', 'Lower commission rate (13%)', 'Access to premium customers'],
  },
  {
    tier: 'pro',
    minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true,
    commission: 11,
    benefits: ['Top search placement', 'Pro badge on profile', 'Lower commission rate (11%)', 'Featured in Suki recommendations', 'Surge pricing access'],
  },
  {
    tier: 'elite',
    minJobs: 100, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true,
    commission: 9,
    benefits: ['Highest search priority', 'Elite badge and premium profile', 'Lowest commission rate (9%)', 'Priority customer support', 'Exclusive high-value jobs', 'Featured provider placement'],
  },
];

export interface TierProgressionData {
  currentTier: string;
  currentCommission: number;
  nextTier: TierRequirement | null;
  progress: {
    totalJobs: number;
    rating: number | null;
    hasCertification: boolean;
    openDisputeCount: number;
  };
  requirements: {
    jobs: { current: number; required: number; met: boolean };
    rating: { current: number | null; required: number; met: boolean };
    certification: { required: boolean; met: boolean };
    disputes: { required: boolean; current: number; met: boolean };
  } | null;
  allTiers: TierRequirement[];
}

export async function getTierProgression(providerId: string): Promise<TierProgressionData> {
  const provider = await db.query<{ tier: string; total_jobs: number; rating: string | null }>(
    `SELECT tier, total_jobs, rating FROM providers WHERE id = $1`,
    [providerId],
  );
  if (!provider.rows[0]) throw createAppError('Provider not found.', 404);

  const row = provider.rows[0];
  const currentTierIdx = TIER_LADDER.findIndex((t) => t.tier === row.tier);
  const currentTier = TIER_LADDER[currentTierIdx] ?? TIER_LADDER[0]!;
  const nextTier = currentTierIdx < TIER_LADDER.length - 1 ? TIER_LADDER[currentTierIdx + 1]! : null;

  const certResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM provider_certifications WHERE provider_id = $1 AND is_verified = TRUE`,
    [providerId],
  );
  const hasCert = Number(certResult.rows[0]?.count ?? 0) > 0;

  const disputeResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM disputes WHERE provider_id = $1 AND status NOT IN ('resolved', 'dismissed')`,
    [providerId],
  );
  const openDisputes = Number(disputeResult.rows[0]?.count ?? 0);

  const rating = row.rating ? Number(row.rating) : null;

  return {
    currentTier: row.tier,
    currentCommission: currentTier.commission,
    nextTier,
    progress: {
      totalJobs: row.total_jobs,
      rating,
      hasCertification: hasCert,
      openDisputeCount: openDisputes,
    },
    requirements: nextTier ? {
      jobs: { current: row.total_jobs, required: nextTier.minJobs, met: row.total_jobs >= nextTier.minJobs },
      rating: { current: rating, required: nextTier.minRating, met: (rating ?? 0) >= nextTier.minRating },
      certification: { required: nextTier.requiresCertification, met: !nextTier.requiresCertification || hasCert },
      disputes: { required: nextTier.requiresZeroDisputes, current: openDisputes, met: !nextTier.requiresZeroDisputes || openDisputes === 0 },
    } : null,
    allTiers: TIER_LADDER,
  };
}
