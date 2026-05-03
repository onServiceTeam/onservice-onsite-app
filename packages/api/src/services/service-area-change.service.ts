/**
 * Phase 14 Dispatch 09 — Bug 1268.
 * Service area change requests with admin review.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export type AreaChangeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface ChangeRow {
  id: string;
  provider_id: string;
  current_area_id: string | null;
  requested_area_id: string;
  current_radius_km: number | null;
  requested_radius_km: number;
  reason: string | null;
  status: AreaChangeStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  decision_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AreaChangeRequest {
  id: string;
  providerId: string;
  currentAreaId: string | null;
  requestedAreaId: string;
  currentRadiusKm: number | null;
  requestedRadiusKm: number;
  reason: string | null;
  status: AreaChangeStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function format(row: ChangeRow): AreaChangeRequest {
  return {
    id: row.id,
    providerId: row.provider_id,
    currentAreaId: row.current_area_id,
    requestedAreaId: row.requested_area_id,
    currentRadiusKm: row.current_radius_km,
    requestedRadiusKm: row.requested_radius_km,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    decisionReason: row.decision_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function requestChange(input: {
  providerId: string;
  currentAreaId: string | null;
  currentRadiusKm: number | null;
  requestedAreaId: string;
  requestedRadiusKm: number;
  reason?: string;
}): Promise<AreaChangeRequest> {
  if (!Number.isInteger(input.requestedRadiusKm) || input.requestedRadiusKm < 1 || input.requestedRadiusKm > 100) {
    throw createAppError('requestedRadiusKm must be between 1 and 100.', 400);
  }
  // The unique partial index will reject if there's a pending request.
  const result = await db.query<ChangeRow>(
    `INSERT INTO service_area_change_requests
       (provider_id, current_area_id, current_radius_km, requested_area_id, requested_radius_km, reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.providerId,
      input.currentAreaId,
      input.currentRadiusKm,
      input.requestedAreaId,
      input.requestedRadiusKm,
      input.reason ?? null,
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

export async function listPending(limit = 50): Promise<AreaChangeRequest[]> {
  const result = await db.query<ChangeRow>(
    `SELECT * FROM service_area_change_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit],
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
  if (input.decision !== 'approved' && input.decision !== 'rejected') {
    throw createAppError('Decision must be approved or rejected.', 400);
  }

  return db.transaction(async (client) => {
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
      const provCheck = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM providers WHERE user_id = $1 LIMIT 1 FOR UPDATE`,
        [row.provider_id],
      );
      if (provCheck.rows.length === 0) {
        throw createAppError(
          'Cannot approve: the provider account no longer exists. Please reject this request.',
          409,
        );
      }
      if (provCheck.rows[0]!.status === 'suspended') {
        throw createAppError(
          'Cannot approve: the provider is currently suspended. Please reject this request.',
          409,
        );
      }
      // BUG-PHASE28-01 fix: providers table has no service_area_id
      // column — area assignment is the join table provider_service_areas.
      // Pre-fix this UPDATE 500'd on every approval (column does not
      // exist). Now: (a) update the provider's radius, (b) demote any
      // existing primary, (c) upsert the requested area as primary.
      const radiusUpdate = await client.query(
        `UPDATE providers
            SET service_radius_km = $2,
                updated_at = NOW()
          WHERE user_id = $1`,
        [row.provider_id, row.requested_radius_km],
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
        JSON.stringify({ decision: input.decision, providerId: existing.rows[0]!.provider_id }),
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
}
