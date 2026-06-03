import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';
import { platformConfig } from '../config/platform.config';

interface ServiceAreaRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  province: string;
  region: string;
  zip_codes: string[];
  center_lat: string;
  center_lng: string;
  radius_km: number;
  status: string;
  launch_date: string | null;
  launched_at: Date | null;
  min_providers_to_launch: number;
  active_provider_count: number;
  active_customer_count: number;
  total_bookings: number;
  is_default: boolean;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface WaitlistRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  province: string;
  barangay: string | null;
  latitude: string | null;
  longitude: string | null;
  service_area_id: string | null;
  notified: boolean;
  notified_at: Date | null;
  created_at: Date;
}

interface ProviderServiceAreaRow {
  id: string;
  provider_id: string;
  service_area_id: string;
  is_primary: boolean;
  created_at: Date;
}

interface CountRow { count: string }

interface CreateServiceAreaParams {
  name: string;
  city: string;
  province: string;
  region: string;
  zipCodes?: string[];
  centerLat: number;
  centerLng: number;
  radiusKm?: number;
  minProvidersToLaunch?: number;
  launchDate?: string;
  settings?: Record<string, unknown>;
}

interface UpdateServiceAreaParams {
  name?: string;
  city?: string;
  province?: string;
  region?: string;
  zipCodes?: string[];
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  status?: string;
  minProvidersToLaunch?: number;
  launchDate?: string;
  settings?: Record<string, unknown>;
}

function generateSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) {
    // MED-N49 fix — Math.random is non-cryptographic and predictable.
    // Slugs are visible in URLs (low-sensitivity) but predictable
    // slugs make it easier to enumerate test areas via brute force.
    // Use a CSPRNG hex slice — same character class as the old
    // [a-z0-9] base36 output.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('node:crypto');
    const fallback = (crypto.randomBytes(4) as Buffer).toString('hex');
    return `area-${fallback}`;
  }

  return slug;
}

const EARTH_RADIUS_KM = 6371;

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number): number => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// MED-N48 fix — pre-fix createServiceArea wrote service_areas with
// no admin_actions audit. Service areas drive customer-facing
// "is your area covered?" UX and provider matching radius — every
// other admin-mutation service in the codebase (catalog, promotions,
// staff) writes paired audit rows; this was the gap.
//
// Post-fix: INSERT + admin_actions row run in a single trx. Caller
// passes adminUserId so the audit attributes the action; the
// existing `createdBy` field on CreateServiceAreaParams already
// fits the same purpose (re-used here so we don't break callers).
export async function createServiceArea(
  params: CreateServiceAreaParams & { createdByAdminId?: string },
): Promise<ServiceAreaRow> {
  const slug = generateSlug(params.name);

  return db.transaction(async (client) => {
    const result = await client.query<ServiceAreaRow>(
      `INSERT INTO service_areas (
        name, slug, city, province, region, zip_codes,
        center_lat, center_lng, radius_km,
        min_providers_to_launch, launch_date, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        params.name, slug, params.city, params.province, params.region,
        params.zipCodes ?? [],
        params.centerLat, params.centerLng,
        Math.min(params.radiusKm ?? platformConfig.defaultServiceAreaRadius, platformConfig.maxServiceRadius),
        params.minProvidersToLaunch ?? 5,
        params.launchDate ?? null,
        JSON.stringify(params.settings ?? {}),
      ],
    );
    const row = result.rows[0]!;

    if (params.createdByAdminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'service_area', $2, $3::jsonb)`,
        [
          params.createdByAdminId,
          row.id,
          JSON.stringify({
            op: 'create',
            slug,
            name: params.name,
            city: params.city,
            province: params.province,
          }),
        ],
      );
    }

    logger.info('Service area created', {
      areaId: row.id,
      name: params.name,
      city: params.city,
      createdByAdminId: params.createdByAdminId ?? null,
    });
    return row;
  });
}

export async function getServiceArea(areaId: string): Promise<ServiceAreaRow> {
  const result = await db.query<ServiceAreaRow>(
    `SELECT * FROM service_areas WHERE id = $1`,
    [areaId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Service area not found.', 404);
  }

  return result.rows[0]!;
}

export async function getServiceAreaBySlug(slug: string): Promise<ServiceAreaRow> {
  const result = await db.query<ServiceAreaRow>(
    `SELECT * FROM service_areas WHERE slug = $1`,
    [slug],
  );

  if (result.rows.length === 0) {
    throw createAppError('Service area not found.', 404);
  }

  return result.rows[0]!;
}

export async function listServiceAreas(
  page = 1,
  pageSize = 20,
  status?: string,
  search?: string,
): Promise<{ items: ServiceAreaRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const params: unknown[] = [];
  let paramIdx = 1;
  let statusClause = '';
  let searchClause = '';

  if (status && ['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired'].includes(status)) {
    statusClause = `AND sa.status = $${paramIdx}`;
    params.push(status);
    paramIdx++;
  }

  if (search) {
    searchClause = `AND (sa.name ILIKE $${paramIdx} OR sa.city ILIKE $${paramIdx} OR sa.province ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM service_areas sa WHERE 1=1 ${statusClause} ${searchClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataParams = [...params, pageSize, offset];
  const result = await db.query<ServiceAreaRow>(
    `SELECT sa.* FROM service_areas sa
     WHERE 1=1 ${statusClause} ${searchClause}
     ORDER BY sa.status ASC, sa.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    dataParams,
  );

  return { items: result.rows, total };
}

export async function getActiveServiceAreas(): Promise<ServiceAreaRow[]> {
  const result = await db.query<ServiceAreaRow>(
    `SELECT * FROM service_areas WHERE status IN ('active', 'soft_launch') ORDER BY name ASC`,
  );
  return result.rows;
}

export async function updateServiceArea(
  areaId: string,
  updates: UpdateServiceAreaParams,
): Promise<ServiceAreaRow> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    name: 'name',
    city: 'city',
    province: 'province',
    region: 'region',
    centerLat: 'center_lat',
    centerLng: 'center_lng',
    radiusKm: 'radius_km',
    minProvidersToLaunch: 'min_providers_to_launch',
    launchDate: 'launch_date',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = updates[key as keyof UpdateServiceAreaParams];
    if (value !== undefined) {
      setClauses.push(`${column} = $${idx}`);
      params.push(value);
      idx++;
    }
  }

  if (updates.zipCodes !== undefined) {
    setClauses.push(`zip_codes = $${idx}`);
    params.push(updates.zipCodes);
    idx++;
  }

  if (updates.settings !== undefined) {
    setClauses.push(`settings = $${idx}`);
    params.push(JSON.stringify(updates.settings));
    idx++;
  }

  if (updates.status !== undefined) {
    const validStatuses = ['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired'];
    if (!validStatuses.includes(updates.status)) {
      throw createAppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }
    setClauses.push(`status = $${idx}`);
    params.push(updates.status);
    idx++;

    if (updates.status === 'active') {
      setClauses.push(`launched_at = COALESCE(launched_at, NOW())`);
    }
  }

  if (updates.name !== undefined) {
    setClauses.push(`slug = $${idx}`);
    params.push(generateSlug(updates.name));
    idx++;
  }

  if (setClauses.length === 0) {
    throw createAppError('No fields to update.', 400);
  }

  setClauses.push('updated_at = NOW()');
  params.push(areaId);

  const result = await db.query<ServiceAreaRow>(
    `UPDATE service_areas SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw createAppError('Service area not found.', 404);
  }

  return result.rows[0]!;
}

// Multi-city — set exactly one area as the app default (drives the mobile
// map center + default pickers). Clears the previous default first so the
// `uq_service_areas_one_default` partial unique index never conflicts. Runs
// the swap + admin_actions audit in a single transaction, mirroring the other
// service-area mutations.
export async function setDefaultServiceArea(
  areaId: string,
  adminId?: string,
): Promise<ServiceAreaRow> {
  return db.transaction(async (client) => {
    const target = await client.query<ServiceAreaRow>(
      `SELECT * FROM service_areas WHERE id = $1`,
      [areaId],
    );
    if (target.rows.length === 0) {
      throw createAppError('Service area not found.', 404);
    }

    // Clear the existing default, then set the new one.
    await client.query(
      `UPDATE service_areas SET is_default = FALSE, updated_at = NOW() WHERE is_default = TRUE AND id <> $1`,
      [areaId],
    );
    const result = await client.query<ServiceAreaRow>(
      `UPDATE service_areas SET is_default = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [areaId],
    );
    const row = result.rows[0]!;

    if (adminId) {
      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details)
         VALUES ($1, 'config_changed', 'service_area', $2, $3::jsonb)`,
        [
          adminId,
          row.id,
          JSON.stringify({ op: 'set_default', slug: row.slug, name: row.name }),
        ],
      );
    }

    return row;
  });
}

export async function checkCoverage(
  lat: number,
  lng: number,
): Promise<{ covered: boolean; area: ServiceAreaRow | null; nearestArea: ServiceAreaRow | null; distanceKm: number | null }> {
  const activeAreas = await db.query<ServiceAreaRow>(
    `SELECT * FROM service_areas WHERE status IN ('active', 'soft_launch')`,
  );

  let coveredArea: ServiceAreaRow | null = null;
  let nearestArea: ServiceAreaRow | null = null;
  let nearestDistance: number | null = null;

  for (const area of activeAreas.rows) {
    const distance = haversineDistance(
      lat, lng,
      Number(area.center_lat), Number(area.center_lng),
    );

    if (distance <= area.radius_km) {
      coveredArea = area;
      break;
    }

    if (nearestDistance === null || distance < nearestDistance) {
      nearestDistance = distance;
      nearestArea = area;
    }
  }

  if (coveredArea) {
    return { covered: true, area: coveredArea, nearestArea: null, distanceKm: null };
  }

  return {
    covered: false,
    area: null,
    nearestArea,
    distanceKm: nearestDistance ? Math.round(nearestDistance * 10) / 10 : null,
  };
}

export async function joinWaitlist(params: {
  fullName: string;
  phone: string;
  email?: string;
  city: string;
  province: string;
  barangay?: string;
  latitude?: number;
  longitude?: number;
}): Promise<WaitlistRow> {
  const matchingArea = await db.query<ServiceAreaRow>(
    `SELECT id FROM service_areas WHERE city ILIKE $1 AND province ILIKE $2 LIMIT 1`,
    [params.city, params.province],
  );

  const serviceAreaId = matchingArea.rows[0]?.id ?? null;

  // MED-N51 fix — ON CONFLICT key now includes province (mig 105).
  // Pre-fix (phone, city) collapsed Mindanao "San Pedro" into Laguna
  // "San Pedro". Post-fix the same phone in different provinces is
  // recognized as separate signups.
  const result = await db.query<WaitlistRow>(
    `INSERT INTO area_waitlist (
      full_name, phone, email, city, province, barangay,
      latitude, longitude, service_area_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (phone, city, province) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = COALESCE(EXCLUDED.email, area_waitlist.email),
      barangay = COALESCE(EXCLUDED.barangay, area_waitlist.barangay),
      latitude = COALESCE(EXCLUDED.latitude, area_waitlist.latitude),
      longitude = COALESCE(EXCLUDED.longitude, area_waitlist.longitude),
      service_area_id = COALESCE(EXCLUDED.service_area_id, area_waitlist.service_area_id)
    RETURNING *`,
    [
      params.fullName, params.phone, params.email ?? null,
      params.city, params.province, params.barangay ?? null,
      params.latitude ?? null, params.longitude ?? null,
      serviceAreaId,
    ],
  );

  logger.info('Waitlist signup', { phone: params.phone, city: params.city, province: params.province });
  return result.rows[0]!;
}

export async function getWaitlist(
  page = 1,
  pageSize = 20,
  city?: string,
  notifiedFilter?: boolean,
): Promise<{ items: WaitlistRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const params: unknown[] = [];
  let paramIdx = 1;
  let cityClause = '';
  let notifiedClause = '';

  if (city) {
    cityClause = `AND aw.city ILIKE $${paramIdx}`;
    params.push(`%${city}%`);
    paramIdx++;
  }

  if (notifiedFilter !== undefined) {
    notifiedClause = `AND aw.notified = $${paramIdx}`;
    params.push(notifiedFilter);
    paramIdx++;
  }

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*)::text as count FROM area_waitlist aw WHERE 1=1 ${cityClause} ${notifiedClause}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataParams = [...params, pageSize, offset];
  const result = await db.query<WaitlistRow>(
    `SELECT aw.* FROM area_waitlist aw
     WHERE 1=1 ${cityClause} ${notifiedClause}
     ORDER BY aw.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    dataParams,
  );

  return { items: result.rows, total };
}

export async function notifyWaitlist(serviceAreaId: string): Promise<number> {
  const area = await getServiceArea(serviceAreaId);

  const waitlistEntries = await db.query<WaitlistRow>(
    `SELECT * FROM area_waitlist
     WHERE (service_area_id = $1 OR city ILIKE $2)
       AND notified = FALSE`,
    [serviceAreaId, area.city],
  );

  let notified = 0;
  for (const entry of waitlistEntries.rows) {
    try {
      const userResult = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
        [entry.phone],
      );

      if (userResult.rows[0]) {
        await notificationService.createNotification({
          userId: userResult.rows[0].id,
          type: 'area_launch',
          title: `${area.name} is Now Live!`,
          body: `onService is now available in ${area.city}, ${area.province}. Book your first service today!`,
          data: { serviceAreaId, areaName: area.name, areaSlug: area.slug },
        });
      }

      await db.query(
        `UPDATE area_waitlist SET notified = TRUE, notified_at = NOW() WHERE id = $1`,
        [entry.id],
      );
      notified++;
    } catch (err) {
      logger.error('Failed to notify waitlist entry', {
        entryId: entry.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  logger.info('Waitlist notified for area launch', {
    serviceAreaId,
    areaName: area.name,
    notifiedCount: notified,
  });

  return notified;
}

export async function assignProviderToArea(
  providerId: string,
  serviceAreaId: string,
  isPrimary = false,
): Promise<ProviderServiceAreaRow> {
  const result = await db.query<ProviderServiceAreaRow>(
    `INSERT INTO provider_service_areas (provider_id, service_area_id, is_primary)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider_id, service_area_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
     RETURNING *`,
    [providerId, serviceAreaId, isPrimary],
  );

  await refreshAreaProviderCount(serviceAreaId);
  return result.rows[0]!;
}

export async function removeProviderFromArea(
  providerId: string,
  serviceAreaId: string,
): Promise<void> {
  const result = await db.query(
    `DELETE FROM provider_service_areas WHERE provider_id = $1 AND service_area_id = $2`,
    [providerId, serviceAreaId],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createAppError('Provider is not assigned to this area.', 404);
  }

  await refreshAreaProviderCount(serviceAreaId);
}

export async function getProviderAreas(
  providerId: string,
): Promise<Array<ProviderServiceAreaRow & { area_name: string; area_city: string; area_status: string }>> {
  const result = await db.query<ProviderServiceAreaRow & { area_name: string; area_city: string; area_status: string }>(
    `SELECT psa.*, sa.name AS area_name, sa.city AS area_city, sa.status AS area_status
     FROM provider_service_areas psa
     INNER JOIN service_areas sa ON psa.service_area_id = sa.id
     WHERE psa.provider_id = $1
     ORDER BY psa.is_primary DESC, sa.name ASC`,
    [providerId],
  );
  return result.rows;
}

export async function getAreaProviders(
  serviceAreaId: string,
): Promise<Array<{ provider_id: string; business_name: string; tier: string; rating: string; is_primary: boolean }>> {
  const result = await db.query<{ provider_id: string; business_name: string; tier: string; rating: string; is_primary: boolean }>(
    `SELECT psa.provider_id, p.business_name, p.tier, p.rating, psa.is_primary
     FROM provider_service_areas psa
     INNER JOIN providers p ON psa.provider_id = p.id
     WHERE psa.service_area_id = $1 AND p.status = 'approved'
     ORDER BY psa.is_primary DESC, p.rating DESC`,
    [serviceAreaId],
  );
  return result.rows;
}

async function refreshAreaProviderCount(serviceAreaId: string): Promise<void> {
  await db.query(
    `UPDATE service_areas SET
       active_provider_count = (
         SELECT COUNT(*) FROM provider_service_areas psa
         INNER JOIN providers p ON psa.provider_id = p.id
         WHERE psa.service_area_id = $1 AND p.status = 'approved'
       ),
       updated_at = NOW()
     WHERE id = $1`,
    [serviceAreaId],
  );
}

export async function getServiceAreaStats(): Promise<{
  totalAreas: number;
  activeAreas: number;
  totalProviders: number;
  totalWaitlist: number;
  areasByStatus: Record<string, number>;
}> {
  const [areasResult, providersResult, waitlistResult, statusResult] = await Promise.all([
    db.query<{ total: string; active: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status IN ('active', 'soft_launch'))::text AS active
       FROM service_areas`,
    ),
    db.query<CountRow>(
      `SELECT COUNT(DISTINCT provider_id)::text AS count FROM provider_service_areas`,
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM area_waitlist WHERE notified = FALSE`,
    ),
    db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM service_areas GROUP BY status`,
    ),
  ]);

  const areasByStatus: Record<string, number> = {};
  for (const row of statusResult.rows) {
    areasByStatus[row.status] = Number(row.count);
  }

  return {
    totalAreas: Number(areasResult.rows[0]?.total ?? 0),
    activeAreas: Number(areasResult.rows[0]?.active ?? 0),
    totalProviders: Number(providersResult.rows[0]?.count ?? 0),
    totalWaitlist: Number(waitlistResult.rows[0]?.count ?? 0),
    areasByStatus,
  };
}

export function formatServiceArea(sa: ServiceAreaRow): Record<string, unknown> {
  return {
    id: sa.id,
    name: sa.name,
    slug: sa.slug,
    city: sa.city,
    province: sa.province,
    region: sa.region,
    zipCodes: sa.zip_codes,
    centerLat: Number(sa.center_lat),
    centerLng: Number(sa.center_lng),
    radiusKm: sa.radius_km,
    status: sa.status,
    launchDate: sa.launch_date,
    launchedAt: sa.launched_at,
    minProvidersToLaunch: sa.min_providers_to_launch,
    activeProviderCount: sa.active_provider_count,
    activeCustomerCount: sa.active_customer_count,
    totalBookings: sa.total_bookings,
    isDefault: sa.is_default,
    settings: sa.settings,
    createdAt: sa.created_at,
    updatedAt: sa.updated_at,
  };
}

export function formatWaitlistEntry(w: WaitlistRow): Record<string, unknown> {
  return {
    id: w.id,
    fullName: w.full_name,
    phone: w.phone,
    email: w.email,
    city: w.city,
    province: w.province,
    barangay: w.barangay,
    latitude: w.latitude ? Number(w.latitude) : null,
    longitude: w.longitude ? Number(w.longitude) : null,
    serviceAreaId: w.service_area_id,
    notified: w.notified,
    notifiedAt: w.notified_at,
    createdAt: w.created_at,
  };
}
