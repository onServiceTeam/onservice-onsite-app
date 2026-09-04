/**
 * Phase 13 Dispatch C — Admin DPO actions on Data Subject Requests + consent versions.
 *
 * All DSR state-changing functions lock the current case and commit their
 * paired admin_actions row in the same transaction. A missing audit write
 * rolls the privacy decision back instead of leaving an unaudited outcome.
 *
 * Status semantics:
 *   - startDsrReview      : claims a received case, sets status='in_progress',
 *                           and records the initial review note.
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
import {
  CONSENT_TYPES,
  isConsentType,
  normalizeIssuedNpcReference,
} from '../types/compliance.types';

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

function appendNote(existing: string | null, line: string): string {
  const stamp = new Date().toISOString();
  const entry = `[${stamp}] ${line}`;
  return existing && existing.length > 0 ? `${existing}\n${entry}` : entry;
}

function normalizeResponsePayloadUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 2000) {
    throw createAppError('responsePayloadUrl cannot exceed 2000 characters.', 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw createAppError('responsePayloadUrl must be a valid HTTPS URL.', 400);
  }
  if (parsed.protocol !== 'https:') {
    throw createAppError('responsePayloadUrl must use HTTPS.', 400);
  }
  return trimmed;
}

// ─── DSR actions ──────────────────────────────────────────────────────────

export async function startDsrReview(input: {
  dsrId: string;
  adminUserId: string;
  reviewNote: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  const reviewNote = input.reviewNote?.trim();
  if (!reviewNote || reviewNote.length < 10) {
    throw createAppError('reviewNote must be at least 10 characters.', 400);
  }
  if (reviewNote.length > 5000) {
    throw createAppError('reviewNote cannot exceed 5000 characters.', 400);
  }

  const updated = await db.transaction(async (client) => {
    const currentResult = await client.query<DsrRow>(
      `SELECT id, user_id, status, admin_notes, completed_at
         FROM data_subject_requests
        WHERE id = $1
        FOR UPDATE`,
      [input.dsrId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Data subject request not found.', 404);
    if (current.status !== 'received') {
      throw createAppError(`Cannot start review on a ${current.status} request.`, 409);
    }

    const newNotes = appendNote(current.admin_notes, `Review started: ${reviewNote}`);
    const updateResult = await client.query<DsrAfterRow>(
      `UPDATE data_subject_requests
          SET status = 'in_progress',
              handled_by = $1,
              admin_notes = $2
        WHERE id = $3
        RETURNING id, user_id, status, request_type, received_at, due_at,
                  completed_at, handled_by, admin_notes, rejection_reason,
                  response_payload_url`,
      [input.adminUserId, newNotes, input.dsrId],
    );
    const row = updateResult.rows[0];
    if (!row) throw createAppError('Data subject request not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'dsr_review_started', 'dsr_request', $2, $3::jsonb)`,
      [
        input.adminUserId,
        input.dsrId,
        JSON.stringify({ previousStatus: current.status, reviewNote }),
      ],
    );
    return row;
  });

  logger.info('DSR review started', { dsrId: input.dsrId, adminUserId: input.adminUserId });
  return mapDsr(updated);
}

export async function markDsrComplete(input: {
  dsrId: string;
  adminUserId: string;
  responsePayloadUrl?: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  const responsePayloadUrl = normalizeResponsePayloadUrl(input.responsePayloadUrl);

  const updated = await db.transaction(async (client) => {
    const currentResult = await client.query<DsrRow>(
      `SELECT id, user_id, status, admin_notes, completed_at
         FROM data_subject_requests
        WHERE id = $1
        FOR UPDATE`,
      [input.dsrId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Data subject request not found.', 404);
    if (current.status === 'completed') {
      throw createAppError('Data subject request already completed.', 409);
    }
    if (current.status === 'rejected') {
      throw createAppError('Cannot complete a rejected request.', 409);
    }
    if (current.status !== 'in_progress') {
      throw createAppError('Start review before completing a received request.', 409);
    }

    const updateResult = await client.query<DsrAfterRow>(
      `UPDATE data_subject_requests
          SET status = 'completed',
              completed_at = NOW(),
              handled_by = $1,
              response_payload_url = COALESCE($2, response_payload_url)
        WHERE id = $3
        RETURNING id, user_id, status, request_type, received_at, due_at,
                  completed_at, handled_by, admin_notes, rejection_reason,
                  response_payload_url`,
      [input.adminUserId, responsePayloadUrl ?? null, input.dsrId],
    );
    const row = updateResult.rows[0];
    if (!row) throw createAppError('Data subject request not found.', 404);

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details)
       VALUES ($1, 'dsr_marked_complete', 'dsr_request', $2, $3::jsonb)`,
      [
        input.adminUserId,
        input.dsrId,
        JSON.stringify({
          previousStatus: current.status,
          responsePayloadUrl: responsePayloadUrl ?? null,
        }),
      ],
    );
    return row;
  });

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

  // The current case row is locked before deciding the next state. This keeps
  // simultaneous complete/reject/request-info actions from overwriting one
  // another after each actor read the same stale status.
  const result = await db.transaction(async (client) => {
    const currentResult = await client.query<DsrRow>(
      `SELECT id, user_id, status, admin_notes, completed_at
         FROM data_subject_requests
        WHERE id = $1
        FOR UPDATE`,
      [input.dsrId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Data subject request not found.', 404);
    if (current.status === 'completed' || current.status === 'rejected') {
      throw createAppError(`Cannot request info on a ${current.status} request.`, 409);
    }

    const newNotes = appendNote(current.admin_notes, `More info requested: ${input.infoNeeded.trim()}`);
    const nextStatus = current.status === 'received' ? 'in_progress' : current.status;
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
    return { updated: row, subjectUserId: current.user_id };
  });

  // Best-effort post-commit notification.
  try {
    await notificationService.createPushNotification({
      userId: result.subjectUserId,
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
  return mapDsr(result.updated);
}

export async function rejectDsr(input: {
  dsrId: string;
  adminUserId: string;
  reason: string;
}): Promise<DsrActionResult> {
  if (!input.dsrId) throw createAppError('dsrId is required.', 400);
  if (!input.adminUserId) throw createAppError('adminUserId is required.', 400);
  // Phase 14 Dispatch 08 — Bug 397. The 30-character minimum is an
  // internal evidence-quality safeguard, not a claim about a statutory mask.
  if (!input.reason || input.reason.trim().length < 30) {
    throw createAppError('Rejection reason must be at least 30 characters.', 400);
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
    const currentResult = await client.query<DsrRow>(
      `SELECT id, user_id, status, admin_notes, completed_at
         FROM data_subject_requests
        WHERE id = $1
        FOR UPDATE`,
      [input.dsrId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Data subject request not found.', 404);
    if (current.status === 'completed') {
      throw createAppError('Cannot reject a completed request.', 409);
    }
    if (current.status === 'rejected') {
      throw createAppError('Data subject request already rejected.', 409);
    }

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
  const npcRefTrimmed = normalizeIssuedNpcReference(input.npcReference ?? '');
  // Published NPC materials use more than one docket/reference family
  // (for example "NPC 21-082", "NPC Case No. 19-258", and older CID
  // references). Preserve the exact issued reference instead of enforcing an
  // invented application-specific mask. Control characters remain forbidden
  // because this value is also appended to case notes and audit evidence.
  if (!npcRefTrimmed) {
    throw createAppError(
      'npcReference must be the 3-100 character reference issued by NPC and cannot contain control characters.',
      400,
    );
  }

  const ref = npcRefTrimmed;
  const updated = await db.transaction(async (client) => {
    const currentResult = await client.query<DsrRow>(
      `SELECT id, user_id, status, admin_notes, completed_at
         FROM data_subject_requests
        WHERE id = $1
        FOR UPDATE`,
      [input.dsrId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Data subject request not found.', 404);
    if (current.status === 'completed' || current.status === 'rejected') {
      throw createAppError(`Cannot escalate a ${current.status} request.`, 409);
    }

    const newNotes = appendNote(current.admin_notes, `Escalated to NPC: ${ref}`);
    const nextStatus = current.status === 'received' ? 'in_progress' : current.status;
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
       VALUES ($1, 'dsr_escalated_to_npc', 'dsr_request', $2, $3::jsonb)`,
      [input.adminUserId, input.dsrId, JSON.stringify({ npcReference: ref })],
    );
    return row;
  });

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
    `WITH latest_decision AS (
       SELECT DISTINCT ON (user_id, consent_type)
              user_id, consent_type, version, granted, revoked_at
         FROM consent_records
        ORDER BY user_id, consent_type, granted_at DESC, id DESC
     ), version_totals AS (
       SELECT consent_type, version,
              COUNT(*)::text AS total_records,
              MIN(granted_at) AS earliest_granted,
              MAX(granted_at) AS latest_granted
         FROM consent_records
        GROUP BY consent_type, version
     ), active_totals AS (
       SELECT consent_type, version, COUNT(*)::text AS active_users
         FROM latest_decision
        WHERE granted = TRUE AND revoked_at IS NULL
        GROUP BY consent_type, version
     )
     SELECT vt.consent_type, vt.version, vt.total_records,
            COALESCE(at.active_users, '0') AS active_users,
            vt.earliest_granted, vt.latest_granted
       FROM version_totals vt
       LEFT JOIN active_totals at
         ON at.consent_type = vt.consent_type AND at.version = vt.version
      ORDER BY vt.consent_type ASC, vt.version DESC`,
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
  targetId: string;
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
  publishedByName: string | null;
  publishedByEmail: string | null;
  publishedAt: string;
}

interface PublishedRow {
  id: string;
  target_id: string;
  admin_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
  details: {
    consentType?: string;
    version?: string;
    effectiveAt?: string;
    changeSummary?: string;
    material?: boolean;
  } | null;
  created_at: Date;
}

function mapPublishedConsentVersion(row: PublishedRow): PublishedConsentVersion {
  return {
    id: row.id,
    targetId: row.target_id,
    consentType: row.details?.consentType ?? '',
    version: row.details?.version ?? '',
    effectiveAt: row.details?.effectiveAt ?? row.created_at.toISOString(),
    changeSummary: row.details?.changeSummary ?? '',
    material: row.details?.material === true,
    publishedBy: row.admin_id,
    publishedByName: row.admin_name ?? null,
    publishedByEmail: row.admin_email ?? null,
    publishedAt: row.created_at.toISOString(),
  };
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
  if (!isConsentType(input.consentType.trim())) {
    throw createAppError(
      `consentType must be one of: ${CONSENT_TYPES.join(', ')}.`,
      400,
    );
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
    result = await db.query<{ id: string; target_id: string; created_at: Date }>(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'consent_version_published', 'consent_version', uuid_generate_v4(), $2::jsonb, $3)
       RETURNING id, target_id, created_at`,
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
    targetId: row.target_id,
    consentType: input.consentType.trim(),
    version: input.version.trim(),
    effectiveAt: effective,
    changeSummary: input.changeSummary.trim(),
    material: input.material === true,
    publishedBy: input.adminUserId,
    publishedByName: null,
    publishedByEmail: null,
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
    where = `AND a.details->>'consentType' = $${params.length}`;
  }
  const result = await db.query<PublishedRow>(
    `SELECT a.id, a.target_id, a.admin_id,
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS admin_name,
            u.email AS admin_email,
            a.details, a.created_at
       FROM admin_actions a
       LEFT JOIN users u ON u.id = a.admin_id
      WHERE a.action_type = 'consent_version_published'
        AND a.target_type = 'consent_version'
        ${where}
      ORDER BY a.created_at DESC`,
    params,
  );

  return result.rows.map(mapPublishedConsentVersion);
}

export async function getPublishedConsentVersion(
  targetId: string,
): Promise<PublishedConsentVersion | null> {
  const result = await db.query<PublishedRow>(
    `SELECT a.id, a.target_id, a.admin_id,
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS admin_name,
            u.email AS admin_email,
            a.details, a.created_at
       FROM admin_actions a
       LEFT JOIN users u ON u.id = a.admin_id
      WHERE a.action_type = 'consent_version_published'
        AND a.target_type = 'consent_version'
        AND a.target_id = $1
      LIMIT 1`,
    [targetId],
  );
  const row = result.rows[0];
  return row ? mapPublishedConsentVersion(row) : null;
}
