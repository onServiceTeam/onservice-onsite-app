/**
 * Phase 14 Dispatch 09 — Bug 1268.
 * Service area change requests with admin review.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { getMaxProviderServiceRadiusKm } from './settings.service';
import { createPushNotification } from './notification.service';

export type AreaChangeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface ChangeRow {
  id: string;
  provider_id: string;
  current_area_id: string | null;
  requested_area_id: string;
  current_radius_km: number | null;
  requested_radius_km: number;
  requested_latitude: string | number | null;
  requested_longitude: string | number | null;
  requested_city: string | null;
  requested_province: string | null;
  reason: string | null;
  status: AreaChangeStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  decision_reason: string | null;
  created_at: Date;
  updated_at: Date;
  provider_record_id?: string | null;
  provider_name?: string | null;
  provider_email?: string | null;
  provider_phone?: string | null;
  current_area_name?: string | null;
  requested_area_name?: string | null;
}

export interface ServiceAreaChangeArea {
  id: string;
  name: string;
  city: string;
  province: string;
  centerLat: number;
  centerLng: number;
}

export interface AreaChangeRequest {
  id: string;
  providerId: string;
  currentAreaId: string | null;
  requestedAreaId: string;
  currentRadiusKm: number | null;
  requestedRadiusKm: number;
  requestedLatitude: number | null;
  requestedLongitude: number | null;
  requestedCity: string | null;
  requestedProvince: string | null;
  reason: string | null;
  status: AreaChangeStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
  providerRecordId: string | null;
  providerName: string | null;
  providerEmail: string | null;
  providerPhone: string | null;
  currentAreaName: string | null;
  requestedAreaName: string | null;
}

function format(row: ChangeRow): AreaChangeRequest {
  return {
    id: row.id,
    providerId: row.provider_id,
    currentAreaId: row.current_area_id,
    requestedAreaId: row.requested_area_id,
    currentRadiusKm: row.current_radius_km,
    requestedRadiusKm: row.requested_radius_km,
    requestedLatitude: row.requested_latitude == null ? null : Number(row.requested_latitude),
    requestedLongitude: row.requested_longitude == null ? null : Number(row.requested_longitude),
    requestedCity: row.requested_city,
    requestedProvince: row.requested_province,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    decisionReason: row.decision_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    providerRecordId: row.provider_record_id ?? null,
    providerName: row.provider_name ?? null,
    providerEmail: row.provider_email ?? null,
    providerPhone: row.provider_phone ?? null,
    currentAreaName: row.current_area_name ?? null,
    requestedAreaName: row.requested_area_name ?? null,
  };
}

interface ProviderAreaRow {
  provider_record_id: string;
  provider_status: string;
  service_radius_km: number;
  latitude: string | number | null;
  longitude: string | number | null;
  current_area_id: string | null;
  current_area_name: string | null;
  current_area_city: string | null;
  current_area_province: string | null;
  current_area_lat: string | number | null;
  current_area_lng: string | number | null;
}

interface RequestedAreaRow {
  id: string;
  name: string;
  city: string;
  province: string;
  center_lat: string | number;
  center_lng: string | number;
  radius_km: number;
  status: string;
}

function toArea(row: ProviderAreaRow): ServiceAreaChangeArea | null {
  if (!row.current_area_id) return null;
  return {
    id: row.current_area_id,
    name: row.current_area_name ?? 'Service area',
    city: row.current_area_city ?? '',
    province: row.current_area_province ?? '',
    centerLat: Number(row.current_area_lat),
    centerLng: Number(row.current_area_lng),
  };
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number): number => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getProviderAreaRow(providerUserId: string): Promise<ProviderAreaRow> {
  const result = await db.query<ProviderAreaRow>(
    `SELECT p.id AS provider_record_id,
            p.status AS provider_status,
            p.service_radius_km,
            p.latitude,
            p.longitude,
            psa.service_area_id AS current_area_id,
            sa.name AS current_area_name,
            sa.city AS current_area_city,
            sa.province AS current_area_province,
            sa.center_lat AS current_area_lat,
            sa.center_lng AS current_area_lng
       FROM providers p
       LEFT JOIN provider_service_areas psa
         ON psa.provider_id = p.id AND psa.is_primary = TRUE
       LEFT JOIN service_areas sa ON sa.id = psa.service_area_id
      WHERE p.user_id = $1
      LIMIT 1`,
    [providerUserId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Provider profile not found.', 404);
  return row;
}

export async function getProviderAreaChangeState(providerUserId: string): Promise<{
  currentArea: ServiceAreaChangeArea | null;
  currentRadiusKm: number;
  currentLatitude: number | null;
  currentLongitude: number | null;
  maxRadiusKm: number;
  latestChange: AreaChangeRequest | null;
}> {
  const [provider, latest, maxRadiusKm] = await Promise.all([
    getProviderAreaRow(providerUserId),
    db.query<ChangeRow>(
      `SELECT acr.*,
              current_area.name AS current_area_name,
              requested_area.name AS requested_area_name
         FROM service_area_change_requests acr
         LEFT JOIN service_areas current_area ON current_area.id = acr.current_area_id
         JOIN service_areas requested_area ON requested_area.id = acr.requested_area_id
        WHERE acr.provider_id = $1
        ORDER BY acr.created_at DESC
        LIMIT 1`,
      [providerUserId],
    ),
    getMaxProviderServiceRadiusKm(),
  ]);
  return {
    currentArea: toArea(provider),
    currentRadiusKm: provider.service_radius_km,
    currentLatitude: provider.latitude == null ? null : Number(provider.latitude),
    currentLongitude: provider.longitude == null ? null : Number(provider.longitude),
    maxRadiusKm,
    latestChange: latest.rows[0] ? format(latest.rows[0]) : null,
  };
}

export async function requestChange(input: {
  providerId: string;
  requestedAreaId: string;
  requestedRadiusKm: number;
  requestedLatitude: number;
  requestedLongitude: number;
  reason?: string;
}): Promise<AreaChangeRequest> {
  const reason = input.reason?.trim() ?? '';
  if (reason.length < 10 || reason.length > 500) {
    throw createAppError('Reason must be between 10 and 500 characters.', 400);
  }
  const maxRadiusKm = await getMaxProviderServiceRadiusKm();
  if (
    !Number.isInteger(input.requestedRadiusKm)
    || input.requestedRadiusKm < 1
    || input.requestedRadiusKm > maxRadiusKm
  ) {
    throw createAppError(`requestedRadiusKm must be between 1 and ${maxRadiusKm}.`, 400);
  }
  if (!Number.isFinite(input.requestedLatitude) || input.requestedLatitude < 4.5 || input.requestedLatitude > 21.5) {
    throw createAppError('requestedLatitude must be within Philippines bounds.', 400);
  }
  if (!Number.isFinite(input.requestedLongitude) || input.requestedLongitude < 116 || input.requestedLongitude > 127.5) {
    throw createAppError('requestedLongitude must be within Philippines bounds.', 400);
  }
  const provider = await getProviderAreaRow(input.providerId);
  if (provider.provider_status !== 'approved') {
    throw createAppError('Only approved providers can request a service-area change.', 409);
  }
  const requestedAreaResult = await db.query<RequestedAreaRow>(
    `SELECT id, name, city, province, center_lat, center_lng, radius_km, status
       FROM service_areas
      WHERE id = $1`,
    [input.requestedAreaId],
  );
  const requestedArea = requestedAreaResult.rows[0];
  if (!requestedArea || !['active', 'soft_launch'].includes(requestedArea.status)) {
    throw createAppError('The requested service area is not currently accepting providers.', 409);
  }
  const requestedDistanceKm = distanceKm(
    input.requestedLatitude,
    input.requestedLongitude,
    Number(requestedArea.center_lat),
    Number(requestedArea.center_lng),
  );
  if (requestedDistanceKm > requestedArea.radius_km) {
    throw createAppError(
      `Your pinned location is outside ${requestedArea.name}. Choose the correct area or update your location pin.`,
      400,
    );
  }
  const sameLocation = provider.latitude != null
    && provider.longitude != null
    && distanceKm(
      Number(provider.latitude),
      Number(provider.longitude),
      input.requestedLatitude,
      input.requestedLongitude,
    ) < 0.01;
  if (
    provider.current_area_id === input.requestedAreaId
    && provider.service_radius_km === input.requestedRadiusKm
    && sameLocation
  ) {
    throw createAppError('This is already your current service area and radius.', 409);
  }
  // The unique partial index will reject if there's a pending request.
  const result = await db.query<ChangeRow>(
    `INSERT INTO service_area_change_requests
       (provider_id, current_area_id, current_radius_km,
        requested_area_id, requested_radius_km,
        requested_latitude, requested_longitude, requested_city, requested_province,
        reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.providerId,
      provider.current_area_id,
      provider.service_radius_km,
      input.requestedAreaId,
      input.requestedRadiusKm,
      input.requestedLatitude,
      input.requestedLongitude,
      requestedArea.city,
      requestedArea.province,
      reason,
    ],
  ).catch((err: unknown) => {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      throw createAppError('You already have a pending area change request.', 409);
    }
    throw err;
  });
  const row = result.rows[0];
  if (!row) throw createAppError('Failed to record area change request.', 500);
  logger.info('Service area change requested', { providerId: input.providerId, changeId: row.id });
  return format(row);
}

export async function cancelPending(providerUserId: string): Promise<AreaChangeRequest> {
  const result = await db.query<ChangeRow>(
    `UPDATE service_area_change_requests
        SET status = 'cancelled',
            updated_at = NOW()
      WHERE provider_id = $1 AND status = 'pending'
      RETURNING *`,
    [providerUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw createAppError('No pending service-area change request was found.', 409);
  }
  logger.info('Service area change cancelled by provider', {
    providerId: providerUserId,
    changeId: row.id,
  });
  return format(row);
}

export async function listPending(
  limit = 50,
  providerRecordId?: string,
): Promise<AreaChangeRequest[]> {
  const result = await db.query<ChangeRow>(
    `SELECT acr.*,
            p.id AS provider_record_id,
            NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), '') AS provider_name,
            u.email AS provider_email,
            u.phone AS provider_phone,
            current_area.name AS current_area_name,
            requested_area.name AS requested_area_name
       FROM service_area_change_requests acr
       JOIN users u ON u.id = acr.provider_id
       LEFT JOIN providers p ON p.user_id = acr.provider_id
       LEFT JOIN service_areas current_area ON current_area.id = acr.current_area_id
       JOIN service_areas requested_area ON requested_area.id = acr.requested_area_id
      WHERE acr.status = 'pending'
        AND ($2::uuid IS NULL OR p.id = $2::uuid)
      ORDER BY acr.created_at ASC
      LIMIT $1`,
    [limit, providerRecordId ?? null],
  );
  return result.rows.map(format);
}

export async function decide(input: {
  changeId: string;
  adminUserId: string;
  decision: 'approved' | 'rejected';
  reason: string;
}): Promise<AreaChangeRequest> {
  if (input.reason.trim().length < 30) {
    throw createAppError('Decision reason must be at least 30 characters.', 400);
  }
  // BUG-PHASE159-01 fix — pre-fix had a min(30) but no max. Column
  // is TEXT — unbounded by Postgres. Same defense-in-depth pattern
  // as Phase 152-158. Cap at 5000 (free-form decision rationale).
  if (input.reason.trim().length > 5000) {
    throw createAppError('Decision reason must be ≤ 5000 characters.', 400);
  }
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw createAppError('Decision must be approved or rejected.', 400);
  }

  const maxRadiusKm = input.decision === 'approved'
    ? await getMaxProviderServiceRadiusKm()
    : null;
  const decided = await db.transaction(async (client) => {
    const existing = await client.query<ChangeRow>(
      `SELECT * FROM service_area_change_requests WHERE id = $1 FOR UPDATE`,
      [input.changeId],
    );
    if (existing.rows.length === 0) {
      throw createAppError('Area change request not found.', 404);
    }
    if (existing.rows[0]!.status !== 'pending') {
      throw createAppError(`Cannot decide a ${existing.rows[0]!.status} request.`, 409);
    }

    if (input.decision === 'approved') {
      const pending = existing.rows[0]!;
      if (pending.requested_radius_km > (maxRadiusKm ?? 0)) {
        throw createAppError(
          `Cannot approve: the requested radius exceeds the current ${maxRadiusKm} km platform maximum.`,
          409,
        );
      }
      if (pending.requested_latitude == null || pending.requested_longitude == null) {
        throw createAppError(
          'Cannot approve: this legacy request has no reviewed location pin. Ask the provider to submit a new request.',
          409,
        );
      }
      const areaCheck = await client.query<RequestedAreaRow>(
        `SELECT id, name, city, province, center_lat, center_lng, radius_km, status
           FROM service_areas
          WHERE id = $1
          FOR SHARE`,
        [pending.requested_area_id],
      );
      const area = areaCheck.rows[0];
      if (!area || !['active', 'soft_launch'].includes(area.status)) {
        throw createAppError(
          'Cannot approve: the requested service area is no longer active. Reject this request and ask the provider to choose another area.',
          409,
        );
      }
      if (distanceKm(
        Number(pending.requested_latitude),
        Number(pending.requested_longitude),
        Number(area.center_lat),
        Number(area.center_lng),
      ) > area.radius_km) {
        throw createAppError(
          'Cannot approve: the reviewed location pin is outside the requested service area.',
          409,
        );
      }
    }

    const updated = await client.query<ChangeRow>(
      `UPDATE service_area_change_requests
          SET status = $2,
              reviewed_by = $3,
              reviewed_at = NOW(),
              decision_reason = $4,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [input.changeId, input.decision, input.adminUserId, input.reason.trim()],
    );

    // MED-N146 fix — pre-fix, the UPDATE applied to providers WHERE
    // user_id = $1 silently affected 0 rows if the provider had been
    // deleted between request submission and admin decision. The
    // change_request was marked 'approved' but the actual provider
    // profile was unchanged. Customer-visible service area would not
    // reflect the approved request.
    //
    // Post-fix: verify the provider row exists and is non-suspended
    // BEFORE the UPDATE. If missing, throw 409 — admin sees a clear
    // error and can reject the request instead.
    if (input.decision === 'approved') {
      const row = updated.rows[0]!;
      const provCheck = await client.query<{
        id: string;
        status: string;
        service_radius_km: number;
        current_area_id: string | null;
      }>(
        `SELECT p.id,
                p.status,
                p.service_radius_km,
                (SELECT psa.service_area_id
                   FROM provider_service_areas psa
                  WHERE psa.provider_id = p.id AND psa.is_primary = TRUE
                  LIMIT 1) AS current_area_id
           FROM providers p
          WHERE p.user_id = $1
          LIMIT 1
          FOR UPDATE`,
        [row.provider_id],
      );
      if (provCheck.rows.length === 0) {
        throw createAppError(
          'Cannot approve: the provider account no longer exists. Please reject this request.',
          409,
        );
      }
      if (provCheck.rows[0]!.status !== 'approved') {
        throw createAppError(
          'Cannot approve: the provider is no longer approved for active matching. Please reject this request.',
          409,
        );
      }
      const currentProvider = provCheck.rows[0]!;
      if (
        currentProvider.current_area_id !== row.current_area_id
        || Number(currentProvider.service_radius_km) !== Number(row.current_radius_km)
      ) {
        throw createAppError(
          'Cannot approve: the provider coverage changed after this request was submitted. Reject it and ask the provider to submit a fresh request.',
          409,
        );
      }
      // BUG-PHASE28-01 fix: providers table has no service_area_id
      // column — area assignment is the join table provider_service_areas.
      // Pre-fix this UPDATE 500'd on every approval (column does not
      // exist). The complete workflow now updates the provider radius and the
      // reviewed location that matching consumes, then moves the primary-area
      // assignment. The provider's submitted coordinates never take effect
      // before this approval transaction commits.
      const radiusUpdate = await client.query(
        `UPDATE providers
            SET service_radius_km = $2,
                latitude = $3,
                longitude = $4,
                city = $5,
                province = $6,
                updated_at = NOW()
          WHERE user_id = $1`,
        [
          row.provider_id,
          row.requested_radius_km,
          row.requested_latitude,
          row.requested_longitude,
          row.requested_city,
          row.requested_province,
        ],
      );
      if ((radiusUpdate.rowCount ?? 0) === 0) {
        throw createAppError('Provider profile update did not match a row. Aborting.', 500);
      }
      // Demote whatever is currently primary for this provider.
      await client.query(
        `UPDATE provider_service_areas
            SET is_primary = FALSE
          WHERE provider_id = (SELECT id FROM providers WHERE user_id = $1)
            AND is_primary = TRUE`,
        [row.provider_id],
      );
      // Upsert the requested area as the new primary. UNIQUE constraint
      // (provider_id, service_area_id) makes this safe to re-run.
      await client.query(
        `INSERT INTO provider_service_areas (provider_id, service_area_id, is_primary)
         VALUES ((SELECT id FROM providers WHERE user_id = $1), $2, TRUE)
         ON CONFLICT (provider_id, service_area_id)
         DO UPDATE SET is_primary = TRUE`,
        [row.provider_id, row.requested_area_id],
      );
    }

    const verb = input.decision === 'approved'
      ? 'service_area_change_approved'
      : 'service_area_change_rejected';

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       VALUES ($1, $2, 'service_area_change_request', $3, $4::jsonb, $5, $6)`,
      [
        input.adminUserId,
        verb,
        input.changeId,
        JSON.stringify({
          decision: input.decision,
          providerId: existing.rows[0]!.provider_id,
          requestedAreaId: existing.rows[0]!.requested_area_id,
          requestedRadiusKm: existing.rows[0]!.requested_radius_km,
          requestedLatitude: existing.rows[0]!.requested_latitude,
          requestedLongitude: existing.rows[0]!.requested_longitude,
        }),
        input.reason.trim().slice(0, 500),
        input.reason.trim(),
      ],
    );

    logger.info('Service area change decided', {
      changeId: input.changeId,
      adminUserId: input.adminUserId,
      decision: input.decision,
    });
    return format(updated.rows[0]!);
  });

  try {
    await createPushNotification({
      userId: decided.providerId,
      type: input.decision === 'approved'
        ? 'service_area_change_approved'
        : 'service_area_change_rejected',
      title: input.decision === 'approved'
        ? 'Service area change approved'
        : 'Service area change needs attention',
      body: input.decision === 'approved'
        ? `Your service area change to ${decided.requestedAreaName ?? decided.requestedCity ?? 'the requested area'} is now active.`
        : `Your service area change was not approved. Open Service Area to read the decision and submit a corrected request.`,
      data: {
        changeRequestId: decided.id,
        route: '/provider/service-area',
        decision: input.decision,
      },
    });
  } catch (error) {
    logger.error('Service area decision notification failed', {
      changeId: input.changeId,
      providerId: decided.providerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return decided;
}
