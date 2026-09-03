import type { QueryResult, QueryResultRow } from 'pg';

import { createAppError } from '../middleware/error.middleware';
import { db } from '../models/db';

type PgClient = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
};

export type CommissionScopeType = 'tier' | 'provider';
export type ProviderTier = 'founding' | 'new' | 'verified' | 'pro' | 'elite';

const PROVIDER_TIERS = new Set<ProviderTier>([
  'founding', 'new', 'verified', 'pro', 'elite',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_FUTURE_DELAY_MS = 15 * 60 * 1000;
const MIN_REASON_LENGTH = 20;
const MAX_REASON_LENGTH = 1000;
export const SCHEDULE_CONFIRMATION = 'SCHEDULE COMMISSION CHANGE';
export const CANCELLATION_CONFIRMATION = 'CANCEL COMMISSION CHANGE';

export interface CommissionScheduleRequest {
  scopeType: unknown;
  tier?: unknown;
  providerId?: unknown;
  serviceCategoryId?: unknown;
  serviceSubcategoryId?: unknown;
  rateBasisPoints: unknown;
  effectiveFrom: unknown;
  reason: unknown;
  confirmation?: unknown;
}

interface NormalizedSchedule {
  scopeType: CommissionScopeType;
  tier: ProviderTier | null;
  providerId: string | null;
  serviceCategoryId: string | null;
  serviceSubcategoryId: string | null;
  rateBasisPoints: number;
  effectiveFrom: Date;
  reason: string;
}

interface RateRow extends QueryResultRow {
  id: string;
  scope_type: CommissionScopeType;
  tier: ProviderTier | null;
  provider_id: string | null;
  provider_name: string | null;
  provider_tier: ProviderTier | null;
  service_category_id: string | null;
  category_name: string | null;
  service_subcategory_id: string | null;
  subcategory_name: string | null;
  rate_basis_points: number;
  effective_from: Date;
  reason: string;
  source: 'migration_seed' | 'admin_schedule' | 'provider_contract' | 'legacy_review';
  source_metadata: Record<string, unknown>;
  created_by: string | null;
  created_by_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  created_at: Date;
  cancellation_id: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_at: Date | null;
  snapshot_usage_count: string;
  lifecycle_status: 'cancelled' | 'scheduled' | 'active' | 'superseded';
}

export interface CommissionRateVersion {
  id: string;
  scopeType: CommissionScopeType;
  tier: ProviderTier | null;
  providerId: string | null;
  providerName: string | null;
  providerTier: ProviderTier | null;
  serviceCategoryId: string | null;
  categoryName: string | null;
  serviceSubcategoryId: string | null;
  subcategoryName: string | null;
  rateBasisPoints: number;
  ratePercent: number;
  effectiveFrom: Date;
  reason: string;
  source: RateRow['source'];
  sourceMetadata: Record<string, unknown>;
  createdBy: string | null;
  createdByName: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  createdAt: Date;
  cancellation: null | {
    id: string;
    reason: string;
    cancelledBy: string;
    cancelledByName: string | null;
    cancelledAt: Date;
  };
  snapshotUsageCount: number;
  lifecycleStatus: RateRow['lifecycle_status'];
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalUuid(value: unknown, field: string): string | null {
  const normalized = textValue(value);
  if (!normalized) return null;
  if (!UUID_PATTERN.test(normalized)) throw createAppError(`${field} must be a valid UUID.`, 400);
  return normalized;
}

function requiredUuid(value: unknown, field: string): string {
  const normalized = optionalUuid(value, field);
  if (!normalized) throw createAppError(`${field} is required.`, 400);
  return normalized;
}

function normalizeReason(value: unknown): string {
  const reason = textValue(value);
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw createAppError(
      `reason must be ${MIN_REASON_LENGTH} to ${MAX_REASON_LENGTH} characters.`,
      400,
    );
  }
  return reason;
}

function normalizeSchedule(input: CommissionScheduleRequest): NormalizedSchedule {
  if (input.scopeType !== 'tier' && input.scopeType !== 'provider') {
    throw createAppError('scopeType must be "tier" or "provider".', 400);
  }
  const scopeType = input.scopeType;
  const tierValue = textValue(input.tier) as ProviderTier;
  const tier = tierValue && PROVIDER_TIERS.has(tierValue) ? tierValue : null;
  const providerId = optionalUuid(input.providerId, 'providerId');
  if (scopeType === 'tier' && !tier) {
    throw createAppError('A valid provider tier is required for a tier schedule.', 400);
  }
  if (scopeType === 'tier' && providerId) {
    throw createAppError('providerId is not allowed for a tier schedule.', 400);
  }
  if (scopeType === 'provider' && !providerId) {
    throw createAppError('providerId is required for a provider agreement.', 400);
  }
  if (scopeType === 'provider' && textValue(input.tier)) {
    throw createAppError('tier is not allowed for a provider agreement.', 400);
  }

  const serviceCategoryId = optionalUuid(input.serviceCategoryId, 'serviceCategoryId');
  const serviceSubcategoryId = optionalUuid(input.serviceSubcategoryId, 'serviceSubcategoryId');
  if (serviceSubcategoryId && !serviceCategoryId) {
    throw createAppError('serviceCategoryId is required when a subcategory is selected.', 400);
  }

  const rateBasisPoints = Number(input.rateBasisPoints);
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 5000) {
    throw createAppError('rateBasisPoints must be an integer between 0 and 5000.', 400);
  }
  const effectiveFrom = new Date(textValue(input.effectiveFrom));
  if (!Number.isFinite(effectiveFrom.getTime())) {
    throw createAppError('effectiveFrom must be a valid ISO date and time.', 400);
  }

  return {
    scopeType,
    tier: scopeType === 'tier' ? tier : null,
    providerId: scopeType === 'provider' ? providerId : null,
    serviceCategoryId,
    serviceSubcategoryId,
    rateBasisPoints,
    effectiveFrom,
    reason: normalizeReason(input.reason),
  };
}

function assertConfirmation(actual: unknown, expected: string): void {
  if (actual !== expected) {
    throw createAppError(`Type "${expected}" to confirm this money-control action.`, 400);
  }
}

async function databaseNow(client: PgClient): Promise<Date> {
  const result = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const now = result.rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw createAppError('Database clock could not be read for the commission control.', 500);
  }
  return now;
}

function assertProspective(effectiveFrom: Date, now: Date): void {
  if (effectiveFrom.getTime() < now.getTime() + MIN_FUTURE_DELAY_MS) {
    throw createAppError(
      'Commission changes must start at least 15 minutes in the future. Existing transactions cannot be repriced.',
      409,
    );
  }
}

async function validateReferences(client: PgClient, input: NormalizedSchedule): Promise<void> {
  if (input.providerId) {
    const provider = await client.query('SELECT id FROM providers WHERE id = $1', [input.providerId]);
    if (!provider.rows[0]) throw createAppError('Provider not found.', 404);
  }
  if (input.serviceCategoryId) {
    const category = await client.query(
      'SELECT id FROM service_categories WHERE id = $1',
      [input.serviceCategoryId],
    );
    if (!category.rows[0]) throw createAppError('Service category not found.', 404);
  }
  if (input.serviceSubcategoryId) {
    const subcategory = await client.query<{ category_id: string }>(
      'SELECT category_id FROM service_subcategories WHERE id = $1',
      [input.serviceSubcategoryId],
    );
    if (!subcategory.rows[0]) throw createAppError('Service subcategory not found.', 404);
    if (subcategory.rows[0].category_id !== input.serviceCategoryId) {
      throw createAppError('The selected subcategory does not belong to the selected category.', 409);
    }
  }
}

function scopeParams(input: NormalizedSchedule): unknown[] {
  return [
    input.scopeType,
    input.tier,
    input.providerId,
    input.serviceCategoryId,
    input.serviceSubcategoryId,
  ];
}

async function loadImpact(client: PgClient, input: NormalizedSchedule): Promise<{
  eligibleProviderCount: number;
  approvedProviderCount: number;
  currentlyAssignedPendingBookingCount: number;
  existingSnapshotCount: number;
  currentExactScopeRateBasisPoints: number | null;
}> {
  const providerCounts = await client.query<{ total: string; approved: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status = 'approved')::text AS approved
       FROM providers
      WHERE (
          ($1::text = 'provider' AND id = $3::uuid)
          OR ($1::text = 'tier' AND tier = $2::text)
        )
        AND (
          $4::uuid IS NULL
          OR EXISTS (
            SELECT 1
              FROM provider_services ps
             WHERE ps.provider_id = providers.id
               AND ps.is_active = TRUE
               AND ps.category_id = $4::uuid
               AND ($5::uuid IS NULL OR ps.subcategory_id IS NULL OR ps.subcategory_id = $5::uuid)
          )
        )`,
    scopeParams(input),
  );

  const pendingBookings = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM bookings b
       JOIN providers p ON p.id = b.provider_id
       LEFT JOIN booking_financial_terms_current ft ON ft.booking_id = b.id
      WHERE b.escrow_status = 'pending'
        AND ft.id IS NULL
        AND (($1::text = 'provider' AND p.id = $3::uuid)
          OR ($1::text = 'tier' AND p.tier = $2::text))
        AND ($4::uuid IS NULL OR b.category_id = $4::uuid)
        AND ($5::uuid IS NULL OR b.subcategory_id = $5::uuid)`,
    scopeParams(input),
  );

  const snapshots = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM booking_financial_terms_current ft
       JOIN bookings b ON b.id = ft.booking_id
      WHERE ft.terms_state = 'final'
        AND (($1::text = 'provider' AND ft.provider_id = $3::uuid)
          OR ($1::text = 'tier' AND ft.provider_tier = $2::text))
        AND ($4::uuid IS NULL OR b.category_id = $4::uuid)
        AND ($5::uuid IS NULL OR b.subcategory_id = $5::uuid)`,
    scopeParams(input),
  );

  const currentRate = await client.query<{ rate_basis_points: number }>(
    `SELECT crv.rate_basis_points
       FROM commission_rate_versions crv
       LEFT JOIN commission_rate_version_cancellations cancelled
         ON cancelled.commission_rate_version_id = crv.id
      WHERE cancelled.id IS NULL
        AND crv.scope_type = $1
        AND crv.tier IS NOT DISTINCT FROM $2::text
        AND crv.provider_id IS NOT DISTINCT FROM $3::uuid
        AND crv.service_category_id IS NOT DISTINCT FROM $4::uuid
        AND crv.service_subcategory_id IS NOT DISTINCT FROM $5::uuid
        AND crv.effective_from <= $6
      ORDER BY crv.effective_from DESC, crv.created_at DESC
      LIMIT 1`,
    [...scopeParams(input), input.effectiveFrom],
  );

  return {
    eligibleProviderCount: Number(providerCounts.rows[0]?.total ?? 0),
    approvedProviderCount: Number(providerCounts.rows[0]?.approved ?? 0),
    currentlyAssignedPendingBookingCount: Number(pendingBookings.rows[0]?.count ?? 0),
    existingSnapshotCount: Number(snapshots.rows[0]?.count ?? 0),
    currentExactScopeRateBasisPoints: currentRate.rows[0]
      ? Number(currentRate.rows[0].rate_basis_points)
      : null,
  };
}

export async function previewCommissionSchedule(input: CommissionScheduleRequest): Promise<{
  schedule: NormalizedSchedule;
  impact: Awaited<ReturnType<typeof loadImpact>> & { existingSnapshotsWillChange: false };
}> {
  const normalized = normalizeSchedule(input);
  return db.transaction(async (client) => {
    const now = await databaseNow(client);
    assertProspective(normalized.effectiveFrom, now);
    await validateReferences(client, normalized);
    const impact = await loadImpact(client, normalized);
    return {
      schedule: normalized,
      impact: { ...impact, existingSnapshotsWillChange: false },
    };
  });
}

function mapRate(row: RateRow): CommissionRateVersion {
  return {
    id: row.id,
    scopeType: row.scope_type,
    tier: row.tier,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerTier: row.provider_tier,
    serviceCategoryId: row.service_category_id,
    categoryName: row.category_name,
    serviceSubcategoryId: row.service_subcategory_id,
    subcategoryName: row.subcategory_name,
    rateBasisPoints: Number(row.rate_basis_points),
    ratePercent: Number(row.rate_basis_points) / 100,
    effectiveFrom: row.effective_from,
    reason: row.reason,
    source: row.source,
    sourceMetadata: row.source_metadata,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name,
    createdAt: row.created_at,
    cancellation: row.cancellation_id && row.cancellation_reason && row.cancelled_by && row.cancelled_at
      ? {
        id: row.cancellation_id,
        reason: row.cancellation_reason,
        cancelledBy: row.cancelled_by,
        cancelledByName: row.cancelled_by_name,
        cancelledAt: row.cancelled_at,
      }
      : null,
    snapshotUsageCount: Number(row.snapshot_usage_count),
    lifecycleStatus: row.lifecycle_status,
  };
}

const RATE_SELECT = `
  SELECT crv.*,
         p.business_name AS provider_name,
         p.tier AS provider_tier,
         category.name AS category_name,
         subcategory.name AS subcategory_name,
         NULLIF(TRIM(CONCAT_WS(' ', creator.first_name, creator.last_name)), '') AS created_by_name,
         NULLIF(TRIM(CONCAT_WS(' ', approver.first_name, approver.last_name)), '') AS approved_by_name,
         cancellation.id AS cancellation_id,
         cancellation.reason AS cancellation_reason,
         cancellation.cancelled_by,
         NULLIF(TRIM(CONCAT_WS(' ', canceller.first_name, canceller.last_name)), '') AS cancelled_by_name,
         cancellation.created_at AS cancelled_at,
         COUNT(terms.id)::text AS snapshot_usage_count,
         CASE
           WHEN cancellation.id IS NOT NULL THEN 'cancelled'
           WHEN crv.effective_from > clock_timestamp() THEN 'scheduled'
           WHEN EXISTS (
             SELECT 1
               FROM commission_rate_versions newer
               LEFT JOIN commission_rate_version_cancellations newer_cancelled
                 ON newer_cancelled.commission_rate_version_id = newer.id
              WHERE newer_cancelled.id IS NULL
                AND newer.scope_type = crv.scope_type
                AND newer.tier IS NOT DISTINCT FROM crv.tier
                AND newer.provider_id IS NOT DISTINCT FROM crv.provider_id
                AND newer.service_category_id IS NOT DISTINCT FROM crv.service_category_id
                AND newer.service_subcategory_id IS NOT DISTINCT FROM crv.service_subcategory_id
                AND newer.effective_from <= clock_timestamp()
                AND newer.effective_from > crv.effective_from
           ) THEN 'superseded'
           ELSE 'active'
         END AS lifecycle_status
    FROM commission_rate_versions crv
    LEFT JOIN providers p ON p.id = crv.provider_id
    LEFT JOIN service_categories category ON category.id = crv.service_category_id
    LEFT JOIN service_subcategories subcategory ON subcategory.id = crv.service_subcategory_id
    LEFT JOIN users creator ON creator.id = crv.created_by
    LEFT JOIN users approver ON approver.id = crv.approved_by
    LEFT JOIN commission_rate_version_cancellations cancellation
      ON cancellation.commission_rate_version_id = crv.id
    LEFT JOIN users canceller ON canceller.id = cancellation.cancelled_by
    LEFT JOIN booking_financial_terms terms ON terms.commission_rate_version_id = crv.id`;

const RATE_GROUP_BY = `
  GROUP BY crv.id, p.business_name, p.tier, category.name, subcategory.name,
           creator.first_name, creator.last_name, approver.first_name, approver.last_name,
           cancellation.id, cancellation.reason, cancellation.cancelled_by,
           cancellation.created_at, canceller.first_name, canceller.last_name`;

export async function listCommissionRates(limit = 100, offset = 0): Promise<{
  items: CommissionRateVersion[];
  total: number;
}> {
  const safeLimit = Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 100;
  const safeOffset = Number.isInteger(offset) ? Math.max(0, offset) : 0;
  const [items, total] = await Promise.all([
    db.query<RateRow>(
      `${RATE_SELECT}
       WHERE crv.scope_type IN ('tier', 'provider')
       ${RATE_GROUP_BY}
       ORDER BY crv.effective_from DESC, crv.created_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM commission_rate_versions
        WHERE scope_type IN ('tier', 'provider')`,
    ),
  ]);
  return { items: items.rows.map(mapRate), total: Number(total.rows[0]?.count ?? 0) };
}

export async function getCommissionRateById(
  rateIdValue: unknown,
): Promise<CommissionRateVersion | null> {
  const rateId = requiredUuid(rateIdValue, 'rateId');
  const result = await db.query<RateRow>(
    `${RATE_SELECT}
     WHERE crv.id = $1
       AND crv.scope_type IN ('tier', 'provider')
     ${RATE_GROUP_BY}`,
    [rateId],
  );
  return result.rows[0] ? mapRate(result.rows[0]) : null;
}

export async function scheduleCommissionRate(
  input: CommissionScheduleRequest,
  actorId: string,
): Promise<{ rate: CommissionRateVersion; impact: Awaited<ReturnType<typeof loadImpact>> }> {
  assertConfirmation(input.confirmation, SCHEDULE_CONFIRMATION);
  const normalized = normalizeSchedule(input);
  try {
    return await db.transaction(async (client) => {
      const now = await databaseNow(client);
      assertProspective(normalized.effectiveFrom, now);
      await validateReferences(client, normalized);
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [JSON.stringify(scopeParams(normalized))],
      );
      const impact = await loadImpact(client, normalized);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO commission_rate_versions (
           scope_type, tier, provider_id, service_category_id, service_subcategory_id,
           rate_basis_points, effective_from, reason, created_by, approved_by, source,
           source_metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11::jsonb)
         RETURNING id`,
        [
          normalized.scopeType,
          normalized.tier,
          normalized.providerId,
          normalized.serviceCategoryId,
          normalized.serviceSubcategoryId,
          normalized.rateBasisPoints,
          normalized.effectiveFrom,
          normalized.reason,
          actorId,
          normalized.scopeType === 'tier' ? 'admin_schedule' : 'provider_contract',
          JSON.stringify({ previewedImpact: impact }),
        ],
      );
      const rateId = inserted.rows[0]?.id;
      if (!rateId) throw createAppError('Commission schedule could not be recorded.', 500);

      await client.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, details, reason, full_notes)
         VALUES ($1, 'commission_rate_scheduled', $2, $3, $4::jsonb, $5, $5)`,
        [
          actorId,
          normalized.scopeType === 'provider' ? 'provider' : 'config',
          normalized.providerId ?? rateId,
          JSON.stringify({
            commissionRateVersionId: rateId,
            rateBasisPoints: normalized.rateBasisPoints,
            effectiveFrom: normalized.effectiveFrom,
            tier: normalized.tier,
            providerId: normalized.providerId,
            serviceCategoryId: normalized.serviceCategoryId,
            serviceSubcategoryId: normalized.serviceSubcategoryId,
            impact,
          }),
          normalized.reason,
        ],
      );

      const rateResult = await client.query<RateRow>(
        `${RATE_SELECT} WHERE crv.id = $1 ${RATE_GROUP_BY}`,
        [rateId],
      );
      const rate = rateResult.rows[0];
      if (!rate) throw createAppError('Commission schedule could not be reloaded.', 500);
      return { rate: mapRate(rate), impact };
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw createAppError('A commission schedule already exists for this scope and effective time.', 409);
    }
    throw error;
  }
}

export async function cancelScheduledCommissionRate(
  rateIdValue: unknown,
  input: { reason: unknown; confirmation: unknown },
  actorId: string,
): Promise<CommissionRateVersion> {
  const rateId = requiredUuid(rateIdValue, 'rateId');
  const reason = normalizeReason(input.reason);
  assertConfirmation(input.confirmation, CANCELLATION_CONFIRMATION);

  return db.transaction(async (client) => {
    const now = await databaseNow(client);
    const locked = await client.query<{
      id: string;
      effective_from: Date;
      cancellation_id: string | null;
    }>(
      `SELECT crv.id, crv.effective_from, cancellation.id AS cancellation_id
         FROM commission_rate_versions crv
         LEFT JOIN commission_rate_version_cancellations cancellation
           ON cancellation.commission_rate_version_id = crv.id
        WHERE crv.id = $1
        FOR UPDATE OF crv`,
      [rateId],
    );
    const rate = locked.rows[0];
    if (!rate) throw createAppError('Commission schedule not found.', 404);
    if (rate.cancellation_id) throw createAppError('Commission schedule is already cancelled.', 409);
    if (rate.effective_from.getTime() <= now.getTime()) {
      throw createAppError(
        'An effective commission version cannot be cancelled. Schedule a new prospective version instead.',
        409,
      );
    }
    const usage = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM booking_financial_terms
        WHERE commission_rate_version_id = $1`,
      [rateId],
    );
    if (Number(usage.rows[0]?.count ?? 0) > 0) {
      throw createAppError(
        'This commission version is already referenced by booking evidence and cannot be cancelled.',
        409,
      );
    }

    await client.query(
      `INSERT INTO commission_rate_version_cancellations
         (commission_rate_version_id, cancelled_by, reason)
       VALUES ($1, $2, $3)`,
      [rateId, actorId, reason],
    );
    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason, full_notes)
       SELECT $2, 'commission_rate_cancelled',
              CASE WHEN scope_type = 'provider' THEN 'provider' ELSE 'config' END,
              CASE WHEN scope_type = 'provider' THEN provider_id ELSE id END,
              jsonb_build_object(
                'commissionRateVersionId', id,
                'effectiveFrom', effective_from,
                'rateBasisPoints', rate_basis_points
              ),
              $3, $3
         FROM commission_rate_versions
        WHERE id = $1`,
      [rateId, actorId, reason],
    );

    const reloaded = await client.query<RateRow>(
      `${RATE_SELECT} WHERE crv.id = $1 ${RATE_GROUP_BY}`,
      [rateId],
    );
    if (!reloaded.rows[0]) throw createAppError('Cancelled commission schedule could not be reloaded.', 500);
    return mapRate(reloaded.rows[0]);
  });
}
