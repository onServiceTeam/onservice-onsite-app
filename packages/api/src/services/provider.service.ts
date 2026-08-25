import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as uploadService from './upload.service';
import * as settingsService from './settings.service';

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
  category_id: string;
  base_price: string | null;
  is_active: boolean;
  created_at: Date;
}

interface ActiveSubcategory {
  id: string;
  name: string;
  category_id: string;
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
    yearsExperience?: number | null;
    serviceRadiusKm?: number;
    latitude?: number;
    longitude?: number;
    isAvailable?: boolean;
  },
): Promise<ProviderRow> {
  const setClauses: string[] = [];
  const values: (string | number | boolean | null)[] = [];
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

export async function getProviderServices(
  providerId: string,
): Promise<(ProviderServiceRow & {
  subcategory_name: string;
  subcategory_description: string;
  pricing_type: string;
  catalog_base_price: number | null;
  hourly_rate: number | null;
  unit_label: string | null;
  unit_price: number | null;
  min_price: number | null;
  max_price: number | null;
  category_name: string;
  category_slug: string;
})[]> {
  const result = await db.query<ProviderServiceRow & {
    subcategory_name: string;
    subcategory_description: string;
    pricing_type: string;
    catalog_base_price: number | null;
    hourly_rate: number | null;
    unit_label: string | null;
    unit_price: number | null;
    min_price: number | null;
    max_price: number | null;
    category_name: string;
    category_slug: string;
  }>(
    // Phase 200 — also return the category (name + slug) so the customer app
    // can start a booking from a provider's service row (it needs the category
    // context to seed the booking draft). Pre-fix only the subcategory came
    // back, so "Book this Provider" / tapping a service had no category to
    // route with and dead-ended on an empty booking form.
    `SELECT ps.*, sc.name as subcategory_name,
            sc.description as subcategory_description, sc.pricing_type,
            sc.base_price as catalog_base_price,
            sc.hourly_rate, sc.unit_label, sc.unit_price,
            sc.min_price, sc.max_price,
            c.name as category_name, c.slug as category_slug
     FROM provider_services ps
     JOIN service_subcategories sc ON sc.id = ps.subcategory_id
     JOIN service_categories c ON c.id = ps.category_id
     WHERE ps.provider_id = $1 AND ps.is_active = TRUE
     ORDER BY sc.name ASC`,
    [providerId],
  );
  return result.rows;
}

/** Add a catalog service to a provider profile.
 *
 * E16 containment deliberately accepts no provider price. A new row stores
 * NULL, while reactivating an old row preserves its dormant historical value.
 * Customer/provider responses and booking creation all use catalog pricing.
 */
export async function addProviderService(
  providerId: string,
  subcategoryId: string,
): Promise<ProviderServiceRow> {
  const subcatRow = await getActiveSubcategory(subcategoryId);

  const result = await db.query<ProviderServiceRow>(
    `INSERT INTO provider_services (provider_id, subcategory_id, category_id, base_price)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (provider_id, subcategory_id) DO UPDATE
     SET is_active = TRUE, base_price = provider_services.base_price
     RETURNING *`,
    [providerId, subcategoryId, subcatRow.category_id],
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
  // Phase K MED-K07: optional NBI expiry + ID number captured at
  // application time (mig 115 + provider.validators.ts update).
  nbiExpiryDate?: string;
  governmentIdNumber?: string;
  // 2026-06-28: optional onboarding vetting questionnaire (mig 136).
  // yearsExperience -> providers.years_experience; vettingAnswers -> the
  // providers.vetting_answers JSONB blob (stored verbatim for admin review).
  yearsExperience?: number;
  vettingAnswers?: {
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
  };
}

function normalizeOwnedOnboardingReference(
  value: string,
  userId: string,
  fieldName: string,
): string {
  const objectKey = uploadService.extractObjectKey(value);
  const safeUserId = userId.replace(/[^a-f0-9-]/gi, '');
  const expectedPrefix = `onboarding/${safeUserId}/`;

  if (!objectKey || !objectKey.startsWith(expectedPrefix)) {
    throw createAppError(
      `${fieldName} must reference an onboarding upload owned by this account.`,
      400,
    );
  }

  return objectKey;
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

  // KYC uploads are private bearer references. Accept the full URL returned by
  // the upload endpoint, but persist only an owned onboarding object key. This
  // prevents an applicant from attaching another user's identity document.
  const governmentIdFrontKey = normalizeOwnedOnboardingReference(
    input.governmentIdFrontUrl,
    userId,
    'governmentIdFrontUrl',
  );
  const governmentIdBackKey = normalizeOwnedOnboardingReference(
    input.governmentIdBackUrl,
    userId,
    'governmentIdBackUrl',
  );
  const nbiClearanceKey = normalizeOwnedOnboardingReference(
    input.nbiClearanceUrl,
    userId,
    'nbiClearanceUrl',
  );
  const selfieKey = normalizeOwnedOnboardingReference(
    input.selfieUrl,
    userId,
    'selfieUrl',
  );

  return db.transaction(async (client) => {
    // Phase K MED-K07: optional nbi_expiry_date + government_id_number.
    // Both columns nullable so legacy clients (or admins backfilling
    // later) still work. The 42703 fallback handles deployments where
    // mig 115 hasn't been applied yet — we drop the new column from
    // the INSERT and retry with the legacy 11-column shape.
    // Vetting questionnaire blob (mig 136). Stored verbatim as JSONB; null when
    // the applying client sent no answers (older app build).
    const vettingAnswers =
      input.vettingAnswers && Object.keys(input.vettingAnswers).length > 0
        ? JSON.stringify(input.vettingAnswers)
        : null;

    let providerResult;
    try {
      providerResult = await client.query<ProviderRow>(
        `INSERT INTO providers (
          user_id, business_name, service_radius_km, latitude, longitude,
          city, province, government_id_front_url, government_id_back_url,
          nbi_clearance_url, selfie_url, nbi_expiry_date, government_id_number,
          years_experience, vetting_answers,
          ic_agreement_accepted_at, applied_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, NOW(), NOW(), 'pending')
        RETURNING *`,
        [
          userId, input.businessName, input.serviceRadiusKm,
          input.latitude, input.longitude, input.city, input.province,
          governmentIdFrontKey, governmentIdBackKey,
          nbiClearanceKey, selfieKey,
          input.nbiExpiryDate ?? null,
          input.governmentIdNumber ?? null,
          input.yearsExperience ?? null,
          vettingAnswers,
        ],
      );
    } catch (err: unknown) {
      // Postgres SQLSTATE 42703 = undefined_column (mig 115 not yet
      // applied). Retry with the legacy column set; the optional
      // values are dropped silently in this case.
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '42703') {
        providerResult = await client.query<ProviderRow>(
          `INSERT INTO providers (
            user_id, business_name, service_radius_km, latitude, longitude,
            city, province, government_id_front_url, government_id_back_url,
            nbi_clearance_url, selfie_url, ic_agreement_accepted_at, applied_at, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), 'pending')
          RETURNING *`,
          [
            userId, input.businessName, input.serviceRadiusKm,
            input.latitude, input.longitude, input.city, input.province,
            governmentIdFrontKey, governmentIdBackKey,
            nbiClearanceKey, selfieKey,
          ],
        );
      } else {
        throw err;
      }
    }
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

export function formatProviderService(
  ps: ProviderServiceRow & {
    subcategory_name?: string;
    subcategory_description?: string;
    pricing_type?: string;
    catalog_base_price?: number | null;
    hourly_rate?: number | null;
    unit_label?: string | null;
    unit_price?: number | null;
    min_price?: number | null;
    max_price?: number | null;
    category_name?: string;
    category_slug?: string;
  },
): Record<string, unknown> {
  return {
    id: ps.id,
    providerId: ps.provider_id,
    subcategoryId: ps.subcategory_id,
    subcategoryName: ps.subcategory_name ?? null,
    description: ps.subcategory_description ?? '',
    pricingType: ps.pricing_type ?? null,
    hourlyRate: ps.hourly_rate != null ? Number(ps.hourly_rate) : null,
    unitLabel: ps.unit_label ?? null,
    unitPrice: ps.unit_price != null ? Number(ps.unit_price) : null,
    minPrice: ps.min_price != null ? Number(ps.min_price) : null,
    maxPrice: ps.max_price != null ? Number(ps.max_price) : null,
    // Phase 200 — category context so the customer app can book this service.
    categoryId: ps.category_id ?? null,
    categoryName: ps.category_name ?? null,
    categorySlug: ps.category_slug ?? null,
    // E16 containment: fixed-price cards and booking creation use the same
    // catalog source. Preserve provider_services.base_price in storage, but do
    // not expose it as a customer price until the product policy is resolved.
    basePrice: ps.pricing_type === 'fixed' && ps.catalog_base_price != null
      ? Number(ps.catalog_base_price)
      : null,
    isActive: ps.is_active,
  };
}

export function formatScheduleSlot(s: AvailabilityRow): Record<string, unknown> {
  return {
    id: s.id,
    dayOfWeek: s.day_of_week,
    // Bug UX-084 — PostgreSQL TIME values arrive as HH:MM:SS. The mobile
    // editors accept and submit HH:MM, so returning the raw DB string made a
    // previously disabled day fail validation as soon as it was re-enabled.
    startTime: s.start_time.slice(0, 5),
    endTime: s.end_time.slice(0, 5),
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
  customer_consent_confirmed_at: Date | null;
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

export function validatePortfolioPublication(
  imageUrl: string,
  userId: string,
  customerConsentConfirmed: unknown,
): void {
  if (customerConsentConfirmed !== true) {
    throw createAppError('Customer consent must be confirmed before publishing a portfolio photo.', 400);
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw createAppError(
      'Invalid imageUrl. Portfolio images must be uploaded via /api/v1/uploads first; raw file:// URIs are not accepted.',
      400,
    );
  }

  const portfolioKey = uploadService.extractObjectKey(imageUrl);
  const safeUserId = userId.replace(/[^a-f0-9-]/gi, '');
  if (!portfolioKey || !portfolioKey.startsWith(`portfolio/${safeUserId}/`)) {
    throw createAppError(
      'Invalid imageUrl. Portfolio photos must be uploaded by this account using the portfolio upload context.',
      400,
    );
  }
}

export async function addPortfolioItem(
  providerId: string,
  data: {
    imageUrl: string;
    caption?: string;
    categoryId?: string;
    displayOrder?: number;
    customerConsentConfirmed: true;
  },
): Promise<PortfolioRow> {
  const result = await db.query<PortfolioRow>(
    `INSERT INTO provider_portfolios (
       provider_id, image_url, caption, category_id, display_order,
       customer_consent_confirmed_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW())
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
    customerConsentConfirmed: p.customer_consent_confirmed_at !== null,
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
  issued_date: string | Date | null;
  expiry_date: string | Date | null;
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

export async function getPublicCertifications(providerId: string): Promise<CertificationRow[]> {
  const result = await db.query<CertificationRow>(
    `SELECT * FROM provider_certifications
      WHERE provider_id = $1
        AND is_active = TRUE
        AND is_verified = TRUE
        AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY created_at DESC`,
    [providerId],
  );
  return result.rows;
}

async function getActiveSubcategory(subcategoryId: string): Promise<ActiveSubcategory> {
  const subcat = await db.query<ActiveSubcategory>(
    `SELECT id, name, category_id
       FROM service_subcategories WHERE id = $1 AND is_active = TRUE`,
    [subcategoryId],
  );
  if (subcat.rows.length === 0) throw createAppError('Service subcategory not found or inactive.', 404);
  return subcat.rows[0]!;
}

export async function addCertification(
  providerId: string,
  data: {
    name: string;
    issuingBody?: string;
    certificateNumber?: string | null;
    certificateUrl?: string | null;
    issuedDate?: string | null;
    expiryDate?: string | null;
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
    certificateNumber?: string | null;
    certificateUrl?: string | null;
    issuedDate?: string | null;
    expiryDate?: string | null;
  },
): Promise<CertificationRow> {
  return db.transaction(async (client) => {
    const currentResult = await client.query<CertificationRow>(
      `SELECT * FROM provider_certifications
        WHERE id = $1 AND provider_id = $2 AND is_active = TRUE
        FOR UPDATE`,
      [certId, providerId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Certification not found.', 404);

    const effectiveIssued = data.issuedDate !== undefined
      ? data.issuedDate
      : formatDateKey(current.issued_date);
    const effectiveExpiry = data.expiryDate !== undefined
      ? data.expiryDate
      : formatDateKey(current.expiry_date);
    if (effectiveIssued && effectiveExpiry && effectiveExpiry < effectiveIssued) {
      throw createAppError('Expiry date must be on or after the issued date.', 400);
    }

    // Any provider edit changes the evidence an admin reviewed. Return the
    // credential to pending review instead of leaving a stale verified badge.
    // The row lock keeps this reset and the effective-date validation atomic
    // with an admin review or another provider edit.
    const setClauses: string[] = [
      'updated_at = NOW()',
      'is_verified = FALSE',
      'verified_at = NULL',
      'verified_by = NULL',
    ];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); values.push(data.name); }
    if (data.issuingBody !== undefined) { setClauses.push(`issuing_body = $${paramIndex++}`); values.push(data.issuingBody); }
    if (data.certificateNumber !== undefined) { setClauses.push(`certificate_number = $${paramIndex++}`); values.push(data.certificateNumber); }
    if (data.certificateUrl !== undefined) { setClauses.push(`certificate_url = $${paramIndex++}`); values.push(data.certificateUrl); }
    if (data.issuedDate !== undefined) { setClauses.push(`issued_date = $${paramIndex++}`); values.push(data.issuedDate); }
    if (data.expiryDate !== undefined) { setClauses.push(`expiry_date = $${paramIndex++}`); values.push(data.expiryDate); }

    values.push(certId, providerId);
    const result = await client.query<CertificationRow>(
      `UPDATE provider_certifications SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND provider_id = $${paramIndex} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) throw createAppError('Certification not found.', 404);
    return result.rows[0]!;
  });
}

export async function removeCertification(providerId: string, certId: string): Promise<void> {
  const result = await db.query(
    `UPDATE provider_certifications SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND provider_id = $2`,
    [certId, providerId],
  );
  if (result.rowCount === 0) throw createAppError('Certification not found.', 404);
}

export async function getCertificationDocumentStream(
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

export function formatDateKey(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

export function formatCertification(c: CertificationRow): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    issuingBody: c.issuing_body,
    certificateNumber: c.certificate_number,
    hasDocument: Boolean(c.certificate_url),
    documentUrl: c.certificate_url ? `/api/v1/providers/me/certifications/${c.id}/document` : null,
    issuedDate: formatDateKey(c.issued_date),
    expiryDate: formatDateKey(c.expiry_date),
    isVerified: c.is_verified,
    verifiedAt: c.verified_at,
    createdAt: c.created_at,
  };
}

export function formatPublicCertification(c: CertificationRow): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    issuingBody: c.issuing_body,
    issuedDate: formatDateKey(c.issued_date),
    expiryDate: formatDateKey(c.expiry_date),
    isVerified: c.is_verified,
    verifiedAt: c.verified_at,
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
    startTime: o.start_time?.slice(0, 5) ?? null,
    endTime: o.end_time?.slice(0, 5) ?? null,
    reason: o.reason,
    createdAt: o.created_at,
  };
}

export async function toggleInstantAvailability(
  providerId: string,
  isAvailable: boolean,
): Promise<{ isAvailable: boolean }> {
  // MED-N100 fix — use UPDATE ... RETURNING so the response reflects
  // ACTUAL server state, not the input. Pre-fix the route echoed the
  // request's isAvailable, so a partial / no-row UPDATE silently lied
  // to the client. Post-fix: 0 rows updated = 404, otherwise the value
  // returned is the column we wrote (which equals the input on
  // success — but now the client knows it was actually written).
  const result = await db.query<{ is_available: boolean }>(
    `UPDATE providers SET is_available = $1, updated_at = NOW()
     WHERE id = $2 RETURNING is_available`,
    [isAvailable, providerId],
  );
  if (result.rowCount === 0) {
    throw createAppError('Provider not found.', 404);
  }
  logger.info('Instant availability toggled', { providerId, isAvailable: result.rows[0]!.is_available });
  return { isAvailable: result.rows[0]!.is_available };
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

type ProviderTier = 'founding' | 'new' | 'verified' | 'pro' | 'elite';

interface TierRequirement {
  tier: ProviderTier;
  minJobs: number;
  minRating: number;
  requiresCertification: boolean;
  requiresZeroDisputes: boolean;
  commission: number;
  benefits: string[];
}

type TierDefinition = Omit<TierRequirement, 'commission' | 'benefits'>;

// Criteria live on the server. Commission does not: the current rates are
// resolved from Admin-controlled platform settings for every response below.
const TIER_DEFINITIONS: readonly TierDefinition[] = [
  {
    tier: 'founding',
    minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false,
  },
  {
    tier: 'new',
    minJobs: 0, minRating: 0, requiresCertification: false, requiresZeroDisputes: false,
  },
  {
    tier: 'verified',
    minJobs: 5, minRating: 4.0, requiresCertification: false, requiresZeroDisputes: false,
  },
  {
    tier: 'pro',
    minJobs: 25, minRating: 4.5, requiresCertification: false, requiresZeroDisputes: true,
  },
  {
    tier: 'elite',
    minJobs: 100, minRating: 4.7, requiresCertification: true, requiresZeroDisputes: true,
  },
];

const STANDARD_TIER_NAMES: readonly ProviderTier[] = ['new', 'verified', 'pro', 'elite'];

function percentageFromDecimal(rate: number): number {
  return Number((rate * 100).toFixed(2));
}

function tierFacts(tier: ProviderTier, commission: number): string[] {
  if (tier === 'founding') {
    return [
      'Invite-only status assigned by a super-admin',
      'Parallel to the New to Elite progression ladder',
      `Live commission rate: ${commission}%`,
    ];
  }

  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  return [
    `${label} status is displayed on your provider profile`,
    `Live commission rate: ${commission}%`,
    tier === 'new'
      ? 'Starting point for admin-reviewed progression'
      : 'Tier contributes to the provider-matching score',
  ];
}

async function resolveTierLadder(): Promise<TierRequirement[]> {
  const commissions = await Promise.all(
    TIER_DEFINITIONS.map(async ({ tier }) => percentageFromDecimal(
      await settingsService.getCommissionRate(tier),
    )),
  );

  return TIER_DEFINITIONS.map((definition, index) => {
    const commission = commissions[index]!;
    return {
      ...definition,
      commission,
      benefits: tierFacts(definition.tier, commission),
    };
  });
}

export interface TierProgressionData {
  currentTier: ProviderTier;
  currentCommission: number;
  progressionTrack: 'founding' | 'standard';
  promotionMode: 'admin_review';
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
  progressionTiers: TierRequirement[];
}

export async function getTierProgression(providerId: string): Promise<TierProgressionData> {
  const [provider, certResult, disputeResult, tierLadder] = await Promise.all([
    db.query<{ tier: ProviderTier; completed_jobs: number; rating: string | null }>(
      `SELECT p.tier, p.rating,
              COUNT(b.id) FILTER (
                WHERE b.status IN ('confirmed', 'resolved', 'payout_ready', 'paid_out')
              )::int AS completed_jobs
         FROM providers p
         LEFT JOIN bookings b ON b.provider_id = p.id
        WHERE p.id = $1
        GROUP BY p.id, p.tier, p.rating`,
      [providerId],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
         FROM provider_certifications
        WHERE provider_id = $1
          AND is_verified = TRUE
          AND is_active = TRUE
          AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date)`,
      [providerId],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
         FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
        WHERE b.provider_id = $1
          AND d.status <> 'resolved'`,
      [providerId],
    ),
    resolveTierLadder(),
  ]);
  if (!provider.rows[0]) throw createAppError('Provider not found.', 404);

  const row = provider.rows[0];
  const currentTier = tierLadder.find((tier) => tier.tier === row.tier);
  if (!currentTier) throw createAppError('Provider tier is invalid.', 500);
  const progressionTiers = tierLadder.filter((tier) => STANDARD_TIER_NAMES.includes(tier.tier));

  // MED-N22 fix: 'founding' is a parallel tier with no upward
  // progression target (it would be a downgrade in commission to
  // step from founding=10% to new=15%). Treat founding as terminal
  // for progression — UI can still show `allTiers` to display the
  // standard ladder for context.
  // For non-founding tiers, the next standard step skips index 0
  // (founding) so progression goes new→verified→pro→elite.
  let nextTier: TierRequirement | null = null;
  if (row.tier !== 'founding') {
    const standardIdx = progressionTiers.findIndex((tier) => tier.tier === row.tier);
    nextTier = standardIdx >= 0 && standardIdx < progressionTiers.length - 1
      ? progressionTiers[standardIdx + 1]!
      : null;
  }
  const hasCert = Number(certResult.rows[0]?.count ?? 0) > 0;
  const openDisputes = Number(disputeResult.rows[0]?.count ?? 0);
  const rating = row.rating ? Number(row.rating) : null;
  const completedJobs = Number(row.completed_jobs ?? 0);

  return {
    currentTier: row.tier,
    currentCommission: currentTier.commission,
    progressionTrack: row.tier === 'founding' ? 'founding' : 'standard',
    promotionMode: 'admin_review',
    nextTier,
    progress: {
      totalJobs: completedJobs,
      rating,
      hasCertification: hasCert,
      openDisputeCount: openDisputes,
    },
    requirements: nextTier ? {
      jobs: { current: completedJobs, required: nextTier.minJobs, met: completedJobs >= nextTier.minJobs },
      rating: { current: rating, required: nextTier.minRating, met: (rating ?? 0) >= nextTier.minRating },
      certification: { required: nextTier.requiresCertification, met: !nextTier.requiresCertification || hasCert },
      disputes: { required: nextTier.requiresZeroDisputes, current: openDisputes, met: !nextTier.requiresZeroDisputes || openDisputes === 0 },
    } : null,
    allTiers: tierLadder,
    progressionTiers,
  };
}

// Phase E CRIT-118 fix — NbiStatusBanner (mobile component) used to
// hit /api/v1/provider/nbi-status which did not exist on the backend.
// Every render returned 404; the component fell through to render-null
// because `query.data` stayed undefined, hiding the alert entirely.
//
// This service reads the providers row directly. The schema columns
// `nbi_clearance_url` and `nbi_expiry_date` exist since migration
// 002. Banner classification thresholds:
//   missing  → no clearance URL on file
//   expired  → expiry_date is past today
//   expiring → expiry_date within `provider.nbi_expiry_warning_days`
//              (admin-tunable platform_setting; default 30)
//   valid    → expiry_date more than threshold away
export async function getProviderNbiStatus(
  providerId: string,
): Promise<{
  status: 'valid' | 'expiring' | 'expired' | 'missing';
  expiresAt: string | null;
}> {
  const result = await db.query<{ nbi_clearance_url: string | null; nbi_expiry_date: string | null }>(
    `SELECT nbi_clearance_url, nbi_expiry_date FROM providers WHERE id = $1`,
    [providerId],
  );
  if (result.rows.length === 0) throw createAppError('Provider not found.', 404);
  const row = result.rows[0]!;

  if (!row.nbi_clearance_url) {
    return { status: 'missing', expiresAt: null };
  }
  if (!row.nbi_expiry_date) {
    // URL on file but no expiry recorded — treat as missing so the
    // provider is prompted to upload a complete record.
    return { status: 'missing', expiresAt: null };
  }

  // Read the warning-days threshold lazily via require() to avoid
  // an import cycle (settings.service consults provider.service for
  // some helpers in adjacent codepaths).
  let warningDays = 30;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const settings = require('./settings.service') as {
      getSettingNumber: (key: string) => Promise<number>;
    };
    const fromSettings = await settings.getSettingNumber('provider.nbi_expiry_warning_days');
    if (Number.isFinite(fromSettings) && fromSettings > 0) warningDays = fromSettings;
  } catch {
    // settings.service or the row may not be present — fall back to 30.
  }

  const expiry = new Date(row.nbi_expiry_date);
  const now = new Date();
  const msUntil = expiry.getTime() - now.getTime();
  const daysUntil = Math.floor(msUntil / 86_400_000);

  let status: 'valid' | 'expiring' | 'expired';
  if (daysUntil < 0) status = 'expired';
  else if (daysUntil <= warningDays) status = 'expiring';
  else status = 'valid';

  return { status, expiresAt: expiry.toISOString() };
}
