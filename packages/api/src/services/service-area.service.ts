import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';
import { platformConfig } from '../config/platform.config';
import { randomBytes } from 'node:crypto';
import { maskEmail, maskPhilippinePhone } from '../utils/pii-mask';

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
  launchDate?: string | null;
  settings?: Record<string, unknown>;
}

function assertAdminReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 10 || trimmed.length > 2000) {
    throw createAppError('Reason must be between 10 and 2,000 characters.', 400);
  }
  return trimmed;
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
    const fallback = randomBytes(4).toString('hex');
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
  params: CreateServiceAreaParams & { createdByAdminId: string; reason: string },
): Promise<ServiceAreaRow> {
  const reason = assertAdminReason(params.reason);
  const name = params.name.trim();
  const city = params.city.trim();
  const province = params.province.trim();
  const region = params.region.trim();
  const slug = generateSlug(name);

  return db.transaction(async (client) => {
    const result = await client.query<ServiceAreaRow>(
      `INSERT INTO service_areas (
        name, slug, city, province, region, zip_codes,
        center_lat, center_lng, radius_km,
        min_providers_to_launch, launch_date, settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        name, slug, city, province, region,
        params.zipCodes ?? [],
        params.centerLat, params.centerLng,
        // A market coverage boundary is not a provider's travel-radius limit.
        // HTTP validation and the database constrain market radii to 1..100 km.
        params.radiusKm ?? platformConfig.defaultServiceAreaRadius,
        params.minProvidersToLaunch ?? 5,
        params.launchDate ?? null,
        JSON.stringify(params.settings ?? {}),
      ],
    );
    const row = result.rows[0]!;

    const auditResult = await client.query<{ id: string }>(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'config_changed', 'service_area', $2, $3::jsonb, $4, $5)
         RETURNING id`,
        [
          params.createdByAdminId,
          row.id,
          JSON.stringify({
            op: 'create',
            slug,
            name,
            city,
            province,
          }),
          reason.slice(0, 500),
          reason,
        ],
      );
    if (!auditResult.rows[0]?.id) {
      throw createAppError('Failed to record service-area creation audit.', 500);
    }

    logger.info('Service area created', {
      areaId: row.id,
      name,
      city,
      createdByAdminId: params.createdByAdminId,
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

export async function getProviderApplicationAreas(): Promise<ServiceAreaRow[]> {
  const result = await db.query<ServiceAreaRow>(
    `SELECT *
       FROM service_areas
      WHERE status IN ('active', 'soft_launch', 'recruiting')
      ORDER BY
        CASE status
          WHEN 'active' THEN 1
          WHEN 'soft_launch' THEN 2
          ELSE 3
        END,
        is_default DESC,
        name ASC`,
  );
  return result.rows;
}

export async function updateServiceArea(
  areaId: string,
  updates: UpdateServiceAreaParams,
  adminId: string,
  reason: string,
): Promise<ServiceAreaRow> {
  const trimmedReason = assertAdminReason(reason);
  return db.transaction(async (client) => {
    const beforeResult = await client.query<ServiceAreaRow>(
      `SELECT * FROM service_areas WHERE id = $1 FOR UPDATE`,
      [areaId],
    );
    const before = beforeResult.rows[0];
    if (!before) throw createAppError('Service area not found.', 404);

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
        params.push(typeof value === 'string' && ['name', 'city', 'province', 'region'].includes(key) ? value.trim() : value);
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

    let liveProviderCount: number | null = null;
    if (updates.status !== undefined) {
      const validStatuses = ['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired'];
      if (!validStatuses.includes(updates.status)) {
        throw createAppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }
      if (updates.status === before.status) {
        throw createAppError(`Service area is already ${updates.status.replace(/_/g, ' ')}.`, 409);
      }
      if (updates.status === 'active') {
        if (before.status === 'retired') {
          throw createAppError('A retired service area cannot be activated.', 409);
        }
        const providerCountResult = await client.query<CountRow>(
          `SELECT COUNT(*)::text AS count
             FROM provider_service_areas psa
             JOIN providers p ON p.id = psa.provider_id
            WHERE psa.service_area_id = $1 AND p.status = 'approved'`,
          [areaId],
        );
        liveProviderCount = Number(providerCountResult.rows[0]?.count ?? 0);
        const requiredProviders = updates.minProvidersToLaunch ?? before.min_providers_to_launch;
        if (liveProviderCount < requiredProviders) {
          throw createAppError(
            `Cannot activate this area with ${liveProviderCount} approved providers; at least ${requiredProviders} are required.`,
            409,
          );
        }
      }
      if (updates.status === 'paused') {
        if (before.status !== 'active') {
          throw createAppError('Only an active service area can be paused.', 409);
        }
        if (before.is_default) {
          throw createAppError('Set another active or soft-launch area as default before pausing this area.', 409);
        }
      }
      setClauses.push(`status = $${idx}`);
      params.push(updates.status);
      idx++;
      if (updates.status === 'active') {
        setClauses.push('launched_at = COALESCE(launched_at, NOW())');
        setClauses.push(`active_provider_count = $${idx}`);
        params.push(liveProviderCount);
        idx++;
      }
    }

    if (updates.name !== undefined) {
      setClauses.push(`slug = $${idx}`);
      params.push(generateSlug(updates.name));
      idx++;
    }
    if (setClauses.length === 0) throw createAppError('No fields to update.', 400);

    setClauses.push('updated_at = NOW()');
    params.push(areaId);
    const result = await client.query<ServiceAreaRow>(
      `UPDATE service_areas SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Service area not found.', 404);

    const auditResult = await client.query<{ id: string }>(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'config_changed', 'service_area', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        adminId,
        areaId,
        JSON.stringify({
          op: updates.status ? 'status_change' : 'update',
          previousStatus: before.status,
          updates,
          ...(liveProviderCount == null ? {} : { approvedProviderCount: liveProviderCount }),
        }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    if (!auditResult.rows[0]?.id) throw createAppError('Failed to record service-area update audit.', 500);
    return row;
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
      throw createAppError('A service area with that name or slug already exists.', 409);
    }
    throw error;
  });
}

// Multi-city — set exactly one area as the app default (drives the mobile
// map center + default pickers). Clears the previous default first so the
// `uq_service_areas_one_default` partial unique index never conflicts. Runs
// the swap + admin_actions audit in a single transaction, mirroring the other
// service-area mutations.
export async function setDefaultServiceArea(
  areaId: string,
  adminId: string,
  reason: string,
): Promise<ServiceAreaRow> {
  const trimmedReason = assertAdminReason(reason);
  return db.transaction(async (client) => {
    const target = await client.query<ServiceAreaRow>(
      `SELECT * FROM service_areas WHERE id = $1 FOR UPDATE`,
      [areaId],
    );
    if (target.rows.length === 0) {
      throw createAppError('Service area not found.', 404);
    }
    if (!['active', 'soft_launch'].includes(target.rows[0]!.status)) {
      throw createAppError('Only an active or soft-launch area can be the app default.', 409);
    }
    if (target.rows[0]!.is_default) {
      throw createAppError('This service area is already the app default.', 409);
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

    const auditResult = await client.query<{ id: string }>(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'config_changed', 'service_area', $2, $3::jsonb, $4, $5)
         RETURNING id`,
        [
          adminId,
          row.id,
          JSON.stringify({ op: 'set_default', slug: row.slug, name: row.name }),
          trimmedReason.slice(0, 500),
          trimmedReason,
        ],
      );
    if (!auditResult.rows[0]?.id) throw createAppError('Failed to record default-area audit.', 500);

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
  let coveredDistance: number | null = null;
  let nearestArea: ServiceAreaRow | null = null;
  let nearestDistance: number | null = null;

  for (const area of activeAreas.rows) {
    const distance = haversineDistance(
      lat, lng,
      Number(area.center_lat), Number(area.center_lng),
    );

    if (distance <= area.radius_km) {
      // UX-053 — Metro Cebu service radii overlap. The old `break` selected
      // whichever row Postgres returned first, so a Mandaue coordinate could
      // be classified as Cebu City. Pick the nearest covered center instead.
      if (coveredDistance === null || distance < coveredDistance) {
        coveredArea = area;
        coveredDistance = distance;
      }
      continue;
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

export async function notifyWaitlist(
  serviceAreaId: string,
  audit?: { adminId: string; reason: string },
): Promise<number> {
  const area = await getServiceArea(serviceAreaId);

  if (audit) {
    const trimmedReason = assertAdminReason(audit.reason);
    const auditResult = await db.query<{ id: string }>(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, 'config_changed', 'service_area', $2, $3::jsonb, $4, $5)
       RETURNING id`,
      [
        audit.adminId,
        serviceAreaId,
        JSON.stringify({ op: 'notify_waitlist', areaName: area.name }),
        trimmedReason.slice(0, 500),
        trimmedReason,
      ],
    );
    if (!auditResult.rows[0]?.id) throw createAppError('Failed to record waitlist-notification audit.', 500);
  }

  const waitlistEntries = await db.query<WaitlistRow>(
    `SELECT * FROM area_waitlist
     WHERE (service_area_id = $1 OR (city ILIKE $2 AND province ILIKE $3))
       AND notified = FALSE`,
    [serviceAreaId, area.city, area.province],
  );

  let notified = 0;
  for (const entry of waitlistEntries.rows) {
    try {
      const userResult = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
        [entry.phone],
      );

      if (!userResult.rows[0]) continue;
      await notificationService.createPushNotification({
        userId: userResult.rows[0].id,
        type: 'area_launch',
        title: `${area.name} is Now Live!`,
        body: `onService is now available in ${area.city}, ${area.province}. Book your first service today!`,
        data: { serviceAreaId, areaName: area.name, areaSlug: area.slug },
      });

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

export async function getServiceAreaStats(): Promise<{
  totalAreas: number;
  activeAreas: number;
  totalProviders: number;
  totalWaitlist: number;
  pendingWaitlist: number;
  waitlistNotified: number;
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
      `SELECT COUNT(DISTINCT psa.provider_id)::text AS count
         FROM provider_service_areas psa
         JOIN providers p ON p.id = psa.provider_id
        WHERE p.status = 'approved'`,
    ),
    db.query<{ total: string; pending: string; notified: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE notified = FALSE)::text AS pending,
              COUNT(*) FILTER (WHERE notified = TRUE)::text AS notified
         FROM area_waitlist`,
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
    totalWaitlist: Number(waitlistResult.rows[0]?.total ?? 0),
    pendingWaitlist: Number(waitlistResult.rows[0]?.pending ?? 0),
    waitlistNotified: Number(waitlistResult.rows[0]?.notified ?? 0),
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

export function formatWaitlistEntry(w: WaitlistRow, revealPersonalData = false): Record<string, unknown> {
  const nameParts = w.full_name.trim().split(/\s+/).filter(Boolean);
  const maskedName = nameParts.length > 1
    ? `${nameParts[0]} ${nameParts.at(-1)![0]}.`
    : (nameParts[0] ?? 'Waitlist user');
  return {
    id: w.id,
    fullName: revealPersonalData ? w.full_name : maskedName,
    phone: revealPersonalData ? w.phone : maskPhilippinePhone(w.phone),
    email: revealPersonalData ? w.email : (w.email ? maskEmail(w.email) : null),
    contactMasked: !revealPersonalData,
    city: w.city,
    province: w.province,
    barangay: w.barangay,
    latitude: revealPersonalData && w.latitude ? Number(w.latitude) : null,
    longitude: revealPersonalData && w.longitude ? Number(w.longitude) : null,
    exactLocationMasked: !revealPersonalData && Boolean(w.latitude && w.longitude),
    serviceAreaId: w.service_area_id,
    notified: w.notified,
    notifiedAt: w.notified_at,
    createdAt: w.created_at,
  };
}
