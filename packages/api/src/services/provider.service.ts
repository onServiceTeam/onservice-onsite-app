import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface ProviderRow {
  id: string;
  user_id: string;
  tier: string;
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

export function formatProvider(p: ProviderRow) {
  return {
    id: p.id,
    userId: p.user_id,
    tier: p.tier,
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
    createdAt: p.created_at,
  };
}

export function formatProviderService(ps: ProviderServiceRow & { subcategory_name?: string }) {
  return {
    id: ps.id,
    providerId: ps.provider_id,
    subcategoryId: ps.subcategory_id,
    subcategoryName: ps.subcategory_name ?? null,
    basePrice: ps.base_price ? Number(ps.base_price) : null,
    isActive: ps.is_active,
  };
}

export function formatScheduleSlot(s: AvailabilityRow) {
  return {
    id: s.id,
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    isAvailable: s.is_available,
  };
}
