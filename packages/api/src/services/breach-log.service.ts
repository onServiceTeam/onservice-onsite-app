/**
 * Phase 14 Dispatch 08 — Bug 1366.
 * Breach log service. NPC RA 10173 §38 requires data controllers to notify
 * the NPC within 72 hours of becoming aware of a personal data breach.
 *
 * The service handles:
 * - createBreach: log a new breach (admin Compliance page)
 * - listBreaches: list with sla72h_expired + sla72h_remaining_hours computed
 * - markNpcNotified: set npc_notified_at + npc_reference (NPC-YYYY-XXXXXX)
 * - updateBreachStatus: investigating → mitigating → reported → closed
 *
 * The cron job (jobs/breach-sla-checker.ts) handles 60h-warning and
 * 72h-expired alerts via PagerDuty + Sentry.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export type BreachType =
  | 'unauthorized_access'
  | 'data_loss'
  | 'data_exposure'
  | 'system_compromise'
  | 'other';

export type BreachStatus = 'investigating' | 'mitigating' | 'reported' | 'closed';

const BREACH_TYPES = new Set<BreachType>([
  'unauthorized_access', 'data_loss', 'data_exposure', 'system_compromise', 'other',
]);

const BREACH_STATUSES = new Set<BreachStatus>([
  'investigating', 'mitigating', 'reported', 'closed',
]);

// MED-N79 fix: NPC reference number format per NPC documentation
// (https://privacy.gov.ph) is `NPC-YYYY-XXXXXX` — exactly 6 alpha-
// numeric chars after the year. Pre-fix regex used `{6,}` which
// allowed unbounded suffix length and would have accepted obviously-
// malformed references (e.g., a paste of an entire NPC URL ending
// in "...NPC-2026-ABC123XYZ_garbage"). Tightened to exactly 6.
const NPC_REF_REGEX = /^NPC-\d{4}-[A-Z0-9]{6}$/;

export interface BreachLogRow {
  id: string;
  type: BreachType;
  scope: string;
  affectedUserCount: number | null;
  occurredAt: string;
  discoveredAt: string;
  npcNotifiedAt: string | null;
  npcReference: string | null;
  status: BreachStatus;
  reportedBy: string | null;
  remediationSummary: string | null;
  createdAt: string;
  updatedAt: string;
  sla72hExpired: boolean;
  sla72hRemainingHours: number | null;
}

interface DbBreachRow {
  id: string;
  type: BreachType;
  scope: string;
  affected_user_count: number | null;
  occurred_at: Date;
  discovered_at: Date;
  npc_notified_at: Date | null;
  npc_reference: string | null;
  status: BreachStatus;
  reported_by: string | null;
  remediation_summary: string | null;
  created_at: Date;
  updated_at: Date;
}

function enrichSla(row: DbBreachRow): BreachLogRow {
  const now = Date.now();
  const hoursElapsed = (now - row.discovered_at.getTime()) / 3_600_000;
  const sla72hExpired = row.npc_notified_at === null && hoursElapsed > 72;
  const sla72hRemainingHours = row.npc_notified_at === null
    ? Math.max(0, 72 - hoursElapsed)
    : null;
  return {
    id: row.id,
    type: row.type,
    scope: row.scope,
    affectedUserCount: row.affected_user_count,
    occurredAt: row.occurred_at.toISOString(),
    discoveredAt: row.discovered_at.toISOString(),
    npcNotifiedAt: row.npc_notified_at?.toISOString() ?? null,
    npcReference: row.npc_reference,
    status: row.status,
    reportedBy: row.reported_by,
    remediationSummary: row.remediation_summary,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sla72hExpired,
    sla72hRemainingHours,
  };
}

export async function createBreach(input: {
  type: BreachType;
  scope: string;
  affectedUserCount?: number;
  occurredAt: string;
  discoveredAt: string;
  reportedBy: string;
}): Promise<BreachLogRow> {
  if (!BREACH_TYPES.has(input.type)) {
    throw createAppError('Invalid breach type.', 400);
  }
  if (!input.scope || input.scope.trim().length < 10) {
    throw createAppError('Breach scope must be at least 10 characters.', 400);
  }
  // UX-571 — this value is persisted in a Postgres INTEGER column and is
  // evidence used during incident assessment. Reject negative, fractional,
  // non-finite, and out-of-range counts before opening the transaction.
  if (input.affectedUserCount !== undefined
      && (!Number.isSafeInteger(input.affectedUserCount)
        || input.affectedUserCount < 0
        || input.affectedUserCount > 2_147_483_647)) {
    throw createAppError(
      'affectedUserCount must be a whole number from 0 to 2147483647.',
      400,
    );
  }
  const occurredAt = new Date(input.occurredAt);
  const discoveredAt = new Date(input.discoveredAt);
  if (Number.isNaN(occurredAt.getTime())) throw createAppError('Invalid occurredAt timestamp.', 400);
  if (Number.isNaN(discoveredAt.getTime())) throw createAppError('Invalid discoveredAt timestamp.', 400);
  if (discoveredAt < occurredAt) {
    throw createAppError('discoveredAt cannot be earlier than occurredAt.', 400);
  }

  return db.transaction(async (client) => {
    const result = await client.query<DbBreachRow>(
      `INSERT INTO breach_log
         (type, scope, affected_user_count, occurred_at, discovered_at, status, reported_by)
       VALUES ($1, $2, $3, $4, $5, 'investigating', $6)
       RETURNING *`,
      [
        input.type,
        input.scope.trim(),
        input.affectedUserCount ?? null,
        occurredAt,
        discoveredAt,
        input.reportedBy,
      ],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Failed to log breach.', 500);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'breach_logged', 'breach', $2, $3::jsonb, $4)`,
      [
        input.reportedBy,
        row.id,
        JSON.stringify({
          type: input.type,
          affectedUserCount: input.affectedUserCount,
          discoveredAt: input.discoveredAt,
        }),
        `Breach logged: ${input.type}`,
      ],
    );

    logger.info('Breach logged', { breachId: row.id, type: input.type });
    return enrichSla(row);
  });
}

export async function listBreaches(filter?: {
  status?: BreachStatus;
  pendingNpcOnly?: boolean;
}): Promise<BreachLogRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter?.status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(filter.status);
  }
  if (filter?.pendingNpcOnly) {
    conditions.push(`npc_notified_at IS NULL`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query<DbBreachRow>(
    `SELECT * FROM breach_log ${where} ORDER BY discovered_at DESC`,
    params,
  );
  return result.rows.map(enrichSla);
}

export async function markNpcNotified(input: {
  breachId: string;
  npcReference: string;
  adminUserId: string;
}): Promise<BreachLogRow> {
  const ref = (input.npcReference ?? '').trim();
  if (!NPC_REF_REGEX.test(ref)) {
    throw createAppError(
      'npcReference must match NPC-YYYY-XXXXXX format (e.g., NPC-2026-A1B2C3).',
      400,
    );
  }

  return db.transaction(async (client) => {
    const before = await client.query<DbBreachRow>(
      `SELECT * FROM breach_log WHERE id = $1 FOR UPDATE`,
      [input.breachId],
    );
    if (before.rows.length === 0) throw createAppError('Breach not found.', 404);
    if (before.rows[0]!.npc_notified_at) {
      throw createAppError('Breach already notified to NPC.', 409);
    }

    const result = await client.query<DbBreachRow>(
      `UPDATE breach_log
          SET npc_notified_at = NOW(),
              npc_reference = $2,
              status = CASE WHEN status = 'investigating' THEN 'reported' ELSE status END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [input.breachId, ref],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Failed to mark NPC notified.', 500);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'breach_npc_notified', 'breach', $2, $3::jsonb, $4)`,
      [
        input.adminUserId,
        input.breachId,
        JSON.stringify({ npcReference: ref }),
        `NPC notified: ${ref}`,
      ],
    );

    logger.info('Breach NPC notified', { breachId: input.breachId, npcReference: ref });
    return enrichSla(row);
  });
}

export async function updateBreachStatus(input: {
  breachId: string;
  newStatus: BreachStatus;
  adminUserId: string;
  remediationSummary?: string;
}): Promise<BreachLogRow> {
  if (!BREACH_STATUSES.has(input.newStatus)) {
    throw createAppError('Invalid breach status.', 400);
  }

  return db.transaction(async (client) => {
    const before = await client.query<DbBreachRow>(
      `SELECT * FROM breach_log WHERE id = $1 FOR UPDATE`,
      [input.breachId],
    );
    if (before.rows.length === 0) throw createAppError('Breach not found.', 404);

    const result = await client.query<DbBreachRow>(
      `UPDATE breach_log
          SET status = $2,
              remediation_summary = COALESCE($3, remediation_summary),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [input.breachId, input.newStatus, input.remediationSummary ?? null],
    );
    const row = result.rows[0]!;

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'breach_status_changed', 'breach', $2, $3::jsonb, $4)`,
      [
        input.adminUserId,
        input.breachId,
        JSON.stringify({ from: before.rows[0]!.status, to: input.newStatus }),
        `Status: ${before.rows[0]!.status} → ${input.newStatus}`,
      ],
    );

    logger.info('Breach status changed', { breachId: input.breachId, newStatus: input.newStatus });
    return enrichSla(row);
  });
}
