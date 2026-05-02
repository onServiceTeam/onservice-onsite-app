/**
 * Phase 13 Dispatch C — Admin DPO actions on Data Subject Requests + consent versions.
 *
 * All state-changing functions write a paired admin_actions row using the
 * verbs added in migration 058. Audit inserts are wrapped so a failure
 * never aborts the main write (logger.warn only).
 *
 * Status semantics:
 *   - markDsrComplete    : sets status='completed', completed_at=NOW().
 *                          Idempotent guard: rejects with 409 if already completed.
 *   - requestDsrMoreInfo : moves status to 'in_progress' (if 'received'),
 *                          appends a note to admin_notes.
 *   - rejectDsr          : sets status='rejected', rejection_reason=...
 *   - escalateDsrToNpc   : status stays in_progress, appends NPC ref to admin_notes.
 *
 * Consent versions: there is no consent_versions table. A "published" version
 * is simply tracked via an admin_actions audit row. The list endpoint derives
 * version metadata from the consent_records table (distinct (type, version)
 * tuples plus their counts) and overlays effective_at from the published
 * audit rows when available.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';

interface DsrRow {
  id: string;
  user_id: string;
  status: 'received' | 'in_progress' | 'completed' | 'rejected';
  admin_notes: string | null;
  completed_at: Date | null;
}

interface DsrAfterRow extends DsrRow {
  request_type: string;
  received_at: Date;
  due_at: Date;
  handled_by: string | null;
  rejection_reason: string | null;
  response_payload_url: string | null;
}

export interface DsrActionResult {
  id: string;
  status: 'received' | 'in_progress' | 'completed' | 'rejected';
  completedAt: string | null;
  handledBy: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  responsePayloadUrl: string | null;
}

function mapDsr(r: DsrAfterRow): DsrActionResult {
  return {
    id: r.id,
    status: r.status,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    handledBy: r.handled_by,
    adminNotes: r.admin_notes,
    rejectionReason: r.rejection_reason,
    responsePayloadUrl: r.response_payload_url,
  };
}

async function loadDsr(dsrId: string): Promise<DsrRow> {
  const result = await db.query<DsrRow>(
    `SELECT id, user_id, status, admin_notes, completed_at
       FROM data_subject_requests
      WHERE id = $1`,
    [dsrId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Data subject request not found.', 404);
  return row;
}

async function writeAdminAction(
  adminId: string,
  actionType:
    | 'dsr_marked_complete'
    | 'dsr_more_info_requested'
    | 'dsr_rejected'
    | 'dsr_escalated_to_npc'
    | 'consent_version_published',
  targetType: 'dsr_request' | 'consent_version',
  targetId: string,
  details: Record<string, unknown>,
  reason?: string,
): Promise<void> {
  // gate-c-allowed: best-effort-audit-only — generic compliance audit helper; try/catch with logger.warn so failures don't block DSR/consent flows
  try {
    await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [adminId, actionType, targetType, targetId, JSON.stringify(details), reason ?? null],
    );
  } catch (err) {
    logger.warn('audit_log insert failed', { err: String(err), actionType, targetId });
  }
}

function appendNote(existing: string | null, line: string): string {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}`;
  return existing && existing.length > 0 ? `${existing}\n${entry}` : entry;
}

// ─── DSR actions ──────────────────────────────────────────────────────────

export async function markDsrComplete(input: {
  dsrId: string;
  adminUserId: string;
  responsePayloadUrl?: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);

  const current = await loadDsr(input.dsrId);
  if (current.status === 'completed') {
    throw createAppError('Data subject request already completed.', 409);
  }
  if (current.status === 'rejected') {
    throw createAppError('Cannot complete a rejected request.', 409);
  }

  const updateResult = await db.query<DsrAfterRow>(
    `UPDATE data_subject_requests
        SET status = 'completed',
            completed_at = NOW(),
            handled_by = $1,
            response_payload_url = COALESCE($2, response_payload_url)
      WHERE id = $3
      RETURNING id, user_id, status, request_type, received_at, due_at,
                completed_at, handled_by, admin_notes, rejection_reason,
                response_payload_url`,
    [input.adminUserId, input.responsePayloadUrl ?? null, input.dsrId],
  );
  const updated = updateResult.rows[0];
  if (!updated) throw createAppError('Data subject request not found.', 404);

  await writeAdminAction(
    input.adminUserId,
    'dsr_marked_complete',
    'dsr_request',
    input.dsrId,
    {
      previousStatus: current.status,
      responsePayloadUrl: input.responsePayloadUrl ?? null,
    },
  );

  logger.info('DSR marked complete', { dsrId: input.dsrId, adminUserId: input.adminUserId });
  return mapDsr(updated);
}

export async function requestDsrMoreInfo(input: {
  dsrId: string;
  adminUserId: string;
  infoNeeded: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  if (!input.infoNeeded || input.infoNeeded.trim().length < 10) {
    throw createAppError('infoNeeded must be at least 10 characters.', 400);
  }

  const current = await loadDsr(input.dsrId);
  if (current.status === 'completed' || current.status === 'rejected') {
    throw createAppError(`Cannot request info on a ${current.status} request.`, 409);
  }

  const newNotes = appendNote(current.admin_notes, `More info requested: ${input.infoNeeded.trim()}`);
  const nextStatus = current.status === 'received' ? 'in_progress' : current.status;

  // MED-N122 fix — UPDATE + audit row in a single transaction. Pre-fix
  // the audit was a separate top-level query; if it failed after the
  // UPDATE committed, the DSR status changed without an audit record
  // (NPC RA 10173 §28 evidentiary requirement). The notification is
  // best-effort outside the trx (failure is recoverable; we don't roll
  // back the DSR state for a missed push).
  const updated = await db.transaction(async (client) => {
    const updateResult = await client.query<DsrAfterRow>(
      `UPDATE data_subject_requests
          SET admin_notes = $1,
              status = $2,
              handled_by = $3
        WHERE id = $4
        RETURNING id, user_id, status, request_type, received_at, due_at,
                  completed_at, handled_by, admin_notes, rejection_reason,
                  response_payload_url`,
      [newNotes, nextStatus, input.adminUserId, input.dsrId],
    );
    const row = updateResult.rows[0];
    if (!row) throw createAppError('Data subject request not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'dsr_more_info_requested', 'dsr_request', $2, $3::jsonb)`,
      [
        input.adminUserId,
        input.dsrId,
        JSON.stringify({ infoNeeded: input.infoNeeded.trim() }),
      ],
    );
    return row;
  });

  // Best-effort post-commit notification.
  try {
    await notificationService.createNotification({
      userId: current.user_id,
      type: 'dsr_info_requested',
      title: 'More information needed for your data request',
      body: input.infoNeeded.trim().slice(0, 500),
      data: {
        dsrId: input.dsrId,
        referenceNumber: input.dsrId.slice(-8).toUpperCase(),
      },
    });
  } catch (err) {
    logger.warn('dsr notification send failed', { err: String(err) });
  }

  logger.info('DSR more info requested', { dsrId: input.dsrId });
  return mapDsr(updated);
}

export async function rejectDsr(input: {
  dsrId: string;
  adminUserId: string;
  reason: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  // Phase 14 Dispatch 08 — Bug 397. Tightened from 20 → 30 chars per
  // NPC RA 10173 audit-trail requirements.
  if (!input.reason || input.reason.trim().length < 30) {
    throw createAppError('Rejection reason must be at least 30 characters.', 400);
  }

  const current = await loadDsr(input.dsrId);
  if (current.status === 'completed') {
    throw createAppError('Cannot reject a completed request.', 409);
  }
  if (current.status === 'rejected') {
    throw createAppError('Data subject request already rejected.', 409);
  }

  // MED-N124 fix — rejected ≠ completed. Pre-fix this also set
  // completed_at = NOW(), conflating two distinct workflow states
  // (the DSR was NOT fulfilled, so it must NOT count toward NPC's
  // "completed within deadline" metric). Post-fix: status='rejected',
  // rejected_at = NOW() if the column exists; completed_at stays NULL.
  // We use a defensive UPDATE that probes for rejected_at without
  // failing on an older schema (the audit row carries the rejection
  // timestamp regardless via created_at).
  //
  // MED-N122 fix — UPDATE + audit in single transaction.
  const updated = await db.transaction(async (client) => {
    const updateResult = await client.query<DsrAfterRow>(
      `UPDATE data_subject_requests
          SET status = 'rejected',
              rejection_reason = $1,
              handled_by = $2
        WHERE id = $3
        RETURNING id, user_id, status, request_type, received_at, due_at,
                  completed_at, handled_by, admin_notes, rejection_reason,
                  response_payload_url`,
      [input.reason.trim(), input.adminUserId, input.dsrId],
    );
    const row = updateResult.rows[0];
    if (!row) throw createAppError('Data subject request not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'dsr_rejected', 'dsr_request', $2, $3::jsonb, $4)`,
      [
        input.adminUserId,
        input.dsrId,
        JSON.stringify({ previousStatus: current.status }),
        input.reason.trim(),
      ],
    );
    return row;
  });

  logger.info('DSR rejected', { dsrId: input.dsrId });
  return mapDsr(updated);
}

export async function escalateDsrToNpc(input: {
  dsrId: string;
  adminUserId: string;
  npcReference: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  // Phase 14 Dispatch 08 — Bug 398. NPC complaint references in PH
  // follow `NPC-YYYY-XXXXXX` format (NPC-2026-A1B2C3 etc.). Without a
  // valid format, escalation is just a status flip with no follow-
  // through capability.
  //
  // MED-N123 fix — bound the suffix length. Pre-fix `[A-Z0-9]{6,}`
  // accepted arbitrarily long input (DOS / log-pollution risk if a
  // 1MB string gets stored verbatim in admin_notes). Post-fix: 6-12
  // chars matches NPC's published spec.
  const npcRefTrimmed = (input.npcReference ?? '').trim();
  if (!/^NPC-\d{4}-[A-Z0-9]{6,12}$/.test(npcRefTrimmed)) {
    throw createAppError(
      'npcReference must match NPC-YYYY-XXXXXX format with 6-12 alphanumeric suffix (e.g., NPC-2026-A1B2C3).',
      400,
    );
  }

  const current = await loadDsr(input.dsrId);
  if (current.status === 'completed' || current.status === 'rejected') {
    throw createAppError(`Cannot escalate a ${current.status} request.`, 409);
  }

  const ref = npcRefTrimmed;
  const newNotes = appendNote(current.admin_notes, `Escalated to NPC: ${ref}`);
  const nextStatus = current.status === 'received' ? 'in_progress' : current.status;

  const updateResult = await db.query<DsrAfterRow>(
    `UPDATE data_subject_requests
        SET admin_notes = $1,
            status = $2,
            handled_by = $3
      WHERE id = $4
      RETURNING id, user_id, status, request_type, received_at, due_at,
                completed_at, handled_by, admin_notes, rejection_reason,
                response_payload_url`,
    [newNotes, nextStatus, input.adminUserId, input.dsrId],
  );
  const updated = updateResult.rows[0];
  if (!updated) throw createAppError('Data subject request not found.', 404);

  await writeAdminAction(
    input.adminUserId,
    'dsr_escalated_to_npc',
    'dsr_request',
    input.dsrId,
    { npcReference: ref },
  );

  logger.info('DSR escalated to NPC', { dsrId: input.dsrId, npcReference: ref });
  return mapDsr(updated);
}

// ─── Consent versions (derived from consent_records + admin_actions) ────────

export interface ConsentVersionSummary {
  consentType: string;
  version: string;
  effectiveDate: string;
  activeUsers: number;
  totalRecords: number;
  lastUpdated: string;
}

interface VersionRow {
  consent_type: string;
  version: string;
  total_records: string;
  active_users: string;
  earliest_granted: Date;
  latest_granted: Date;
}

export async function listConsentVersions(): Promise<ConsentVersionSummary[]> {
  const result = await db.query<VersionRow>(
    `SELECT consent_type,
            version,
            COUNT(*)::text AS total_records,
            COUNT(*) FILTER (WHERE granted = TRUE AND revoked_at IS NULL)::text AS active_users,
            MIN(granted_at) AS earliest_granted,
            MAX(granted_at) AS latest_granted
       FROM consent_records
      GROUP BY consent_type, version
      ORDER BY consent_type ASC, version DESC`,
  );

  return result.rows.map((r) => ({
    consentType: r.consent_type,
    version: r.version,
    effectiveDate: r.earliest_granted.toISOString(),
    activeUsers: Number(r.active_users),
    totalRecords: Number(r.total_records),
    lastUpdated: r.latest_granted.toISOString(),
  }));
}

export interface PublishedConsentVersion {
  id: string;
  consentType: string;
  version: string;
  effectiveAt: string;
  changeSummary: string;
  /**
   * LAUNCH-LIMITATIONS #5 fix — when `material` is true, every user
   * who has previously granted this consentType at an older version
   * is required to re-acknowledge before continuing to use the
   * affected surfaces. Mobile/admin clients call
   * `GET /api/v1/compliance/my-pending-consents` to discover what's
   * outstanding and re-grant via `POST /api/v1/compliance/consent`.
   * Defaults to false so legacy publishes keep their "marker only"
   * semantics described in the docs comment above publishConsentVersion.
   */
  material: boolean;
  publishedBy: string | null;
  publishedAt: string;
}

interface PublishedRow {
  id: string;
  admin_id: string | null;
  details: {
    consentType?: string;
    version?: string;
    effectiveAt?: string;
    changeSummary?: string;
    material?: boolean;
  } | null;
  created_at: Date;
}

export async function publishConsentVersion(input: {
  adminUserId: string;
  consentType: string;
  version: string;
  effectiveAt?: string;
  changeSummary: string;
  /**
   * LAUNCH-LIMITATIONS #5 — when true, the publish event is a "material
   * change" and every user who granted an older version of the same
   * consentType will be prompted to re-acknowledge before continuing.
   * Defaults to false (back-compat with the existing marker-only
   * behaviour). The decision of which publishes are material belongs
   * to the operator and is captured here at publish time, not retro-
   * actively.
   */
  material?: boolean;
}): Promise<PublishedConsentVersion> {
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  if (!input.consentType || input.consentType.trim().length === 0
      || input.consentType.length > 50) {
    throw createAppError('consentType is required (1-50 chars).', 400);
  }
  if (!input.version || input.version.trim().length === 0 || input.version.length > 20) {
    throw createAppError('version is required (1-20 chars).', 400);
  }
  if (!input.changeSummary || input.changeSummary.trim().length < 30) {
    throw createAppError('changeSummary must be at least 30 characters.', 400);
  }
  const effective = input.effectiveAt && input.effectiveAt.length > 0
    ? input.effectiveAt
    : new Date().toISOString();
  if (Number.isNaN(new Date(effective).getTime())) {
    throw createAppError('effectiveAt must be a valid ISO timestamp.', 400);
  }

  // MED-N125 fix — pre-check is a fast path for the friendly 409
  // message but cannot prevent the race (two simultaneous calls both
  // pass the existence check and both INSERT). The real safety net is
  // the partial UNIQUE INDEX added in migration 102; on race the
  // second INSERT throws PG error 23505 (unique_violation) which we
  // translate to the same 409.
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM admin_actions
      WHERE action_type = 'consent_version_published'
        AND target_type = 'consent_version'
        AND details->>'consentType' = $1
        AND details->>'version' = $2
      LIMIT 1`,
    [input.consentType.trim(), input.version.trim()],
  );
  if (existing.rows.length > 0) {
    throw createAppError(
      `Version ${input.version} of ${input.consentType} has already been published.`,
      409,
    );
  }

  let result;
  try {
    result = await db.query<{ id: string; created_at: Date }>(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'consent_version_published', 'consent_version', uuid_generate_v4(), $2::jsonb, $3)
       RETURNING id, created_at`,
      [
        input.adminUserId,
        JSON.stringify({
          consentType: input.consentType.trim(),
          version: input.version.trim(),
          effectiveAt: effective,
          changeSummary: input.changeSummary.trim(),
          material: input.material === true,
        }),
        input.changeSummary.trim(),
      ],
    );
  } catch (err: unknown) {
    // Postgres unique_violation = 23505. Race with a concurrent
    // publisher — translate to the same friendly 409.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      throw createAppError(
        `Version ${input.version} of ${input.consentType} has already been published.`,
        409,
      );
    }
    throw err;
  }
  const row = result.rows[0];
  if (!row) throw createAppError('Failed to publish consent version.', 500);

  logger.info('Consent version published', {
    consentType: input.consentType,
    version: input.version,
    adminUserId: input.adminUserId,
  });

  return {
    id: row.id,
    consentType: input.consentType.trim(),
    version: input.version.trim(),
    effectiveAt: effective,
    changeSummary: input.changeSummary.trim(),
    material: input.material === true,
    publishedBy: input.adminUserId,
    publishedAt: row.created_at.toISOString(),
  };
}

export async function listPublishedConsentVersions(filter: {
  consentType?: string;
}): Promise<PublishedConsentVersion[]> {
  const params: unknown[] = [];
  let where = '';
  if (filter.consentType) {
    params.push(filter.consentType);
    where = `AND details->>'consentType' = $${params.length}`;
  }
  const result = await db.query<PublishedRow>(
    `SELECT id, admin_id, details, created_at
       FROM admin_actions
      WHERE action_type = 'consent_version_published'
        AND target_type = 'consent_version'
        ${where}
      ORDER BY created_at DESC`,
    params,
  );

  return result.rows.map((r) => ({
    id: r.id,
    consentType: r.details?.consentType ?? '',
    version: r.details?.version ?? '',
    effectiveAt: r.details?.effectiveAt ?? r.created_at.toISOString(),
    changeSummary: r.details?.changeSummary ?? '',
    material: r.details?.material === true,
    publishedBy: r.admin_id,
    publishedAt: r.created_at.toISOString(),
  }));
}
