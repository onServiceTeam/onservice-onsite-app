/**
 * Phase 11 — Compliance service.
 *
 * Pure, hermetic-friendly functions wrapping the consent_records and
 * data_subject_requests tables (migration 057). Plus utility helpers:
 *   - exportAuditLogCsv: exports the same audit_log + admin_actions timeline
 *     shown in Admin Audit Log (RFC 4180).
 *   - getBirCalendar: fail-closed until an accountant approves the taxpayer
 *     profile and current filing schedule (E22).
 *   - getDsrAlerts: DSRs due in <= 2 days, used by dashboard.
 *
 * Audit: every state-changing function writes a paired audit_log entry.
 * The insert is wrapped in try/catch + logger.warn so a failed audit row
 * never causes the main write to fail.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { neutralizeCsvFormula } from '../utils/csv';
import { maskPiiInObject, maskPiiInString, type Json } from '../utils/pii-mask';
import { CONSENT_TYPES, isConsentType, type ConsentType } from '../types/compliance.types';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type DsrRequestType =
  | 'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection';

export type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected';

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentType;
  version: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface DsrRecord {
  id: string;
  userId: string;
  userEmail: string | null;
  userRole: string | null;
  providerProfileId: string | null;
  requestType: DsrRequestType;
  status: DsrStatus;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
  handledBy: string | null;
  handledByName: string | null;
  handledByEmail: string | null;
  userMessage: string | null;
  adminNotes: string | null;
  responsePayloadUrl: string | null;
  rejectionReason: string | null;
  daysUntilDue: number;
  isOverdue: boolean;
}

/**
 * Customer/provider-facing DSR projection. Internal handler identity, case
 * notes, subject email, and cross-account identifiers must never leave the
 * privacy operations boundary through `/compliance/my-requests`.
 */
export type DsrPublicRecord = Pick<
  DsrRecord,
  | 'id'
  | 'requestType'
  | 'status'
  | 'receivedAt'
  | 'dueAt'
  | 'completedAt'
  | 'userMessage'
  | 'responsePayloadUrl'
  | 'rejectionReason'
  | 'daysUntilDue'
  | 'isOverdue'
>;

interface ConsentRow {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  version: string;
  granted: boolean;
  granted_at: Date;
  revoked_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface DsrRow {
  id: string;
  user_id: string;
  user_email: string | null;
  user_role?: string | null;
  provider_profile_id?: string | null;
  request_type: DsrRequestType;
  status: DsrStatus;
  received_at: Date;
  due_at: Date;
  completed_at: Date | null;
  handled_by: string | null;
  handler_name?: string | null;
  handler_email?: string | null;
  user_message: string | null;
  admin_notes: string | null;
  response_payload_url: string | null;
  rejection_reason: string | null;
}

interface AuditLogExportRow {
  id: string;
  source: 'audit_log' | 'admin_actions';
  created_at: Date;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  old_values: unknown;
  new_values: unknown;
  reason: string | null;
}

const VALID_REQUEST_TYPES: ReadonlySet<DsrRequestType> = new Set([
  'access', 'erasure', 'correction', 'portability', 'restriction', 'objection',
]);

const ALLOWED_TRANSITIONS: Record<DsrStatus, ReadonlySet<DsrStatus>> = {
  received: new Set<DsrStatus>(['in_progress', 'rejected']),
  in_progress: new Set<DsrStatus>(['completed', 'rejected']),
  completed: new Set<DsrStatus>(),
  rejected: new Set<DsrStatus>(),
};

// MED-N43 fix — only 'completed' is a *fulfilled* terminal status
// for purposes of stamping completed_at. 'rejected' is also a
// terminal status but does NOT mean the DSR was fulfilled — stamping
// completed_at on rejection muddles NPC reporting (it's a closed
// request, not a satisfied one). Reporting code should use
// (status='completed') as the "satisfied within 30 days" predicate.
const TERMINAL_STATUSES: ReadonlySet<DsrStatus> = new Set(['completed', 'rejected']);
const FULFILLED_STATUSES: ReadonlySet<DsrStatus> = new Set(['completed']);

const CONSENT_COLS = `id, user_id, consent_type, version, granted,
       granted_at, revoked_at, ip_address::text AS ip_address, user_agent`;

const DSR_COLS = `id, user_id, request_type, status,
       received_at, due_at, completed_at, handled_by,
       user_message, admin_notes, response_payload_url, rejection_reason`;

const DSR_COLS_WITH_USER = `dsr.id, dsr.user_id, u.email AS user_email,
       u.role AS user_role,
       COALESCE(p.id, staff_account.provider_id) AS provider_profile_id,
       dsr.request_type, dsr.status,
       dsr.received_at, dsr.due_at, dsr.completed_at, dsr.handled_by,
       NULLIF(TRIM(CONCAT_WS(' ', handler.first_name, handler.last_name)), '') AS handler_name,
       handler.email AS handler_email,
       dsr.user_message, dsr.admin_notes, dsr.response_payload_url, dsr.rejection_reason`;

// A provider-staff login belongs to the provider through provider_staff rather
// than providers.user_id. Keep that relationship in the canonical DSR subject
// projection so a DPO can reach the employing Provider 360 record. The current
// product supports one active provider context at a time; if historical rows
// exist, the newest relationship is the same deterministic precedent used by
// the support queue.
const DSR_SUBJECT_JOINS = `
       LEFT JOIN users u ON u.id = dsr.user_id
       LEFT JOIN providers p ON p.user_id = dsr.user_id
       LEFT JOIN users handler ON handler.id = dsr.handled_by
       LEFT JOIN LATERAL (
         SELECT ps.provider_id
           FROM provider_staff ps
          WHERE ps.user_id = dsr.user_id
          ORDER BY ps.created_at DESC, ps.id
          LIMIT 1
       ) staff_account ON u.role = 'provider_staff'`;

// ─────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────

function mapConsent(r: ConsentRow): ConsentRecord {
  return {
    id: r.id,
    userId: r.user_id,
    consentType: r.consent_type,
    version: r.version,
    granted: r.granted,
    grantedAt: r.granted_at.toISOString(),
    revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
  };
}

function mapDsr(r: DsrRow, now: Date = new Date()): DsrRecord {
  const dueMs = r.due_at.getTime();
  const diffMs = dueMs - now.getTime();
  const daysUntilDue = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const isTerminal = TERMINAL_STATUSES.has(r.status);
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    userRole: r.user_role ?? null,
    providerProfileId: r.provider_profile_id ?? null,
    requestType: r.request_type,
    status: r.status,
    receivedAt: r.received_at.toISOString(),
    dueAt: r.due_at.toISOString(),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    handledBy: r.handled_by,
    handledByName: r.handler_name ?? null,
    handledByEmail: r.handler_email ?? null,
    userMessage: r.user_message,
    adminNotes: r.admin_notes,
    responsePayloadUrl: r.response_payload_url,
    rejectionReason: r.rejection_reason,
    daysUntilDue,
    isOverdue: !isTerminal && diffMs < 0,
  };
}

export function toPublicDsr(record: DsrRecord): DsrPublicRecord {
  return {
    id: record.id,
    requestType: record.requestType,
    status: record.status,
    receivedAt: record.receivedAt,
    dueAt: record.dueAt,
    completedAt: record.completedAt,
    userMessage: record.userMessage,
    responsePayloadUrl: record.responsePayloadUrl,
    rejectionReason: record.rejectionReason,
    daysUntilDue: record.daysUntilDue,
    isOverdue: record.isOverdue,
  };
}

// ─────────────────────────────────────────────────────────────────
// Audit helper (wrapped: never throws)
// ─────────────────────────────────────────────────────────────────

async function writeAudit(
  action: string,
  entityType: string,
  entityId: string,
  details: { userId?: string | null; oldValues?: unknown; newValues?: unknown; ipAddress?: string | null },
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id,
                              old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        details.userId ?? null,
        action,
        entityType,
        entityId,
        details.oldValues === undefined ? null : JSON.stringify(details.oldValues),
        details.newValues === undefined ? null : JSON.stringify(details.newValues),
        details.ipAddress ?? null,
      ],
    );
  } catch (err) {
    logger.warn('Failed to write compliance audit_log row', {
      action, entityType, entityId, err: String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Consent
// ─────────────────────────────────────────────────────────────────

// BUG-PHASE33-01 fix — pre-fix the route accepted any consent_type
// string, deferring validation to the migration-080 CHECK constraint
// (consent_records_type_valid). A customer hitting POST /consent with
// a typo or stale type from older mobile-build code got a 500 with the
// generic "unexpected error" message. Mirror the DB CHECK in the
// service so callers get a clean 400 with an actionable list.
// Keep this in sync with migration 080 if new types are added.
export async function recordConsent(input: {
  userId: string;
  consentType: string;
  version: string;
  granted: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ConsentRecord> {
  if (typeof input.userId !== 'string' || input.userId.length === 0) {
    throw createAppError('userId is required.', 400);
  }
  if (typeof input.consentType !== 'string' || input.consentType.length === 0
      || input.consentType.length > 50) {
    throw createAppError('consentType is required (1-50 chars).', 400);
  }
  if (!isConsentType(input.consentType)) {
    throw createAppError(
      `consentType must be one of: ${CONSENT_TYPES.join(', ')}.`,
      400,
    );
  }
  if (typeof input.version !== 'string' || input.version.length === 0
      || input.version.length > 20) {
    throw createAppError('version is required (1-20 chars).', 400);
  }
  if (typeof input.granted !== 'boolean') {
    throw createAppError('granted must be a boolean.', 400);
  }

  // MED-N42 fix: pre-fix the revoke UPDATE and the INSERT ran as
  // two separate top-level db.query calls. If the UPDATE succeeded
  // but the INSERT failed, prior consent rows were marked revoked
  // but the new "revocation event" row was never recorded — user
  // ended up with no current consent record AND no audit trail
  // for the revocation. NPC RA 10173 §5(a) requires a verifiable
  // consent trail. Now: both writes inside a single db.transaction
  // so the revoke rolls back if the insert throws.
  return db.transaction(async (client) => {
    if (!input.granted) {
      await client.query(
        `UPDATE consent_records
            SET revoked_at = NOW()
          WHERE user_id = $1
            AND consent_type = $2
            AND granted = TRUE
            AND revoked_at IS NULL`,
        [input.userId, input.consentType],
      );
    }

    const result = await client.query<ConsentRow>(
      `INSERT INTO consent_records
         (user_id, consent_type, version, granted, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CONSENT_COLS}`,
      [
        input.userId,
        input.consentType,
        input.version,
        input.granted,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw createAppError('Failed to record consent.', 500);
    return mapConsent(row);
  });
}

export async function listConsentForUser(userId: string): Promise<ConsentRecord[]> {
  const result = await db.query<ConsentRow>(
    `SELECT ${CONSENT_COLS}
       FROM consent_records
      WHERE user_id = $1
      ORDER BY granted_at DESC`,
    [userId],
  );
  return result.rows.map(mapConsent);
}

export async function searchConsent(filter: {
  userId?: string;
  consentType?: string;
  version?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: ConsentRecord[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) {
    params.push(filter.userId);
    where.push(`user_id = $${params.length}`);
  }
  if (filter.consentType) {
    params.push(filter.consentType);
    where.push(`consent_type = $${params.length}`);
  }
  if (filter.version) {
    params.push(filter.version);
    where.push(`version = $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);

  const totalResult = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM consent_records ${whereSql}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.cnt ?? 0);

  const rowsResult = await db.query<ConsentRow>(
    `SELECT ${CONSENT_COLS}
       FROM consent_records
       ${whereSql}
      ORDER BY granted_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows: rowsResult.rows.map(mapConsent), total };
}

// ─────────────────────────────────────────────────────────────────
// Data Subject Requests
// ─────────────────────────────────────────────────────────────────

export async function createDsr(input: {
  userId: string;
  requestType: DsrRequestType;
  userMessage?: string | null;
  ipAddress?: string | null;
}): Promise<DsrRecord> {
  if (typeof input.userId !== 'string' || input.userId.length === 0) {
    throw createAppError('userId is required.', 400);
  }
  if (!VALID_REQUEST_TYPES.has(input.requestType)) {
    throw createAppError(
      `requestType must be one of: ${Array.from(VALID_REQUEST_TYPES).join(', ')}.`,
      400,
    );
  }
  // BUG-PHASE161-01 fix — pre-fix userMessage had no length cap.
  // Column is TEXT (data_subject_requests.user_message; migration 057)
  // — unbounded by Postgres. Same defense-in-depth pattern as Phase
  // 152-160. Cap at 5000 chars (free-form message to DPO).
  if (input.userMessage !== undefined && input.userMessage !== null
      && typeof input.userMessage === 'string'
      && input.userMessage.length > 5000) {
    throw createAppError('userMessage must be ≤ 5000 characters.', 400);
  }

  const result = await db.query<DsrRow>(
    `INSERT INTO data_subject_requests
       (user_id, request_type, user_message, due_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '15 days')
     RETURNING ${DSR_COLS}, NULL::text AS user_email`,
    [input.userId, input.requestType, input.userMessage ?? null],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Failed to create data subject request.', 500);

  await writeAudit('dsr.created', 'data_subject_request', row.id, {
    userId: input.userId,
    newValues: {
      requestType: row.request_type,
      status: row.status,
      userMessage: row.user_message,
    },
    ipAddress: input.ipAddress ?? null,
  });

  logger.info('DSR created', { id: row.id, userId: input.userId, requestType: input.requestType });

  // LAUNCH-LIMITATIONS #8 fix — automatically link an erasure DSR to
  // the account-deletion pipeline (data-management.service). Pre-fix
  // the DPO had to manually trigger the deletion flow for each
  // erasure DSR; the only thing the DSR submit did was create a row
  // with status='received'. Post-fix we kick off requestAccountDeletion
  // best-effort so the cooling-off + processing pipeline starts
  // immediately. We swallow specific known errors (already-pending
  // deletion request, blocking bookings). The warning is retained in the
  // service log for operations review; failure
  // here must NOT roll back the DSR insert. The request and its current
  // internal 15-day target remain visible even if the auto-kickoff cannot
  // proceed. E40 prohibits describing that target as an NPC-mandated
  // completion deadline.
  if (input.requestType === 'erasure') {
    try {
      // Lazy require to avoid an import cycle (data-management ←
      // compliance, both share writeAudit + db).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dataManagement = require('./data-management.service') as {
        requestAccountDeletion: (
          userId: string,
          reason?: string,
        ) => Promise<unknown>;
      };
      await dataManagement.requestAccountDeletion(
        input.userId,
        `Auto-linked from DSR ${row.id} (erasure request)`,
      );
      logger.info('Erasure DSR auto-linked to account deletion', {
        dsrId: row.id,
        userId: input.userId,
      });
    } catch (err) {
      // Common path: customer already has a pending deletion (409),
      // or has blocking bookings (409). Log and move on — the DPO
      // will see this on the DSR detail page and act accordingly.
      logger.warn('Erasure DSR could not auto-trigger account deletion; DPO must handle manually', {
        dsrId: row.id,
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return mapDsr(row);
}

export async function listDsrs(filter: {
  status?: DsrStatus;
  requestType?: DsrRequestType;
  overdueOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ rows: DsrRecord[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    params.push(filter.status);
    where.push(`dsr.status = $${params.length}`);
  }
  if (filter.requestType) {
    params.push(filter.requestType);
    where.push(`dsr.request_type = $${params.length}`);
  }
  if (filter.overdueOnly) {
    where.push(`dsr.status IN ('received', 'in_progress') AND dsr.due_at < NOW()`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
  const offset = Math.max(0, filter.offset ?? 0);

  const totalResult = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM data_subject_requests dsr
       ${whereSql}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.cnt ?? 0);

  const rowsResult = await db.query<DsrRow>(
    `SELECT ${DSR_COLS_WITH_USER}
       FROM data_subject_requests dsr
       ${DSR_SUBJECT_JOINS}
       ${whereSql}
      ORDER BY dsr.due_at ASC, dsr.received_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows: rowsResult.rows.map((r) => mapDsr(r)), total };
}

// ─────────────────────────────────────────────────────────────────
// LAUNCH-LIMITATIONS #5 fix — pending material re-consents.
// ─────────────────────────────────────────────────────────────────
// When the DPO publishes a NEW consent_version with `material: true`,
// every user who previously granted an OLDER version of that
// consent_type must re-acknowledge before continuing to use the
// affected surfaces. The mechanism is opt-in per publish event so
// existing publishes (the "marker only" pattern) keep their current
// no-op behaviour.
//
// This function returns one row per consent_type the caller has not
// yet re-acknowledged at the latest material version. The mobile +
// admin web clients call this on app start (and after each consent
// publish in admin) and surface a re-consent prompt.
//
// Source of truth for "latest material version" is the admin_actions
// audit row (action_type='consent_version_published'). We pick the
// MOST RECENT row per consentType where details.material === true.
// If no material publish exists for a consentType, the consent is
// not "pending" — only material publishes drive the re-consent
// requirement.
//
// User has acknowledged a version when their most recent
// consent_records row for that consent_type has the same version
// AND granted=TRUE AND revoked_at IS NULL. A user who explicitly
// REVOKED is not considered "pending re-consent" — they made an
// active decision to opt out and the surface that depends on the
// consent must respect that. The mobile prompt copy distinguishes
// "you previously accepted v1; please review v2" (pending) from
// "you previously revoked v1" (treated as new opt-in flow).

export interface PendingMaterialConsent {
  consentType: string;
  latestVersion: string;
  effectiveAt: string;
  changeSummary: string;
  /** The version the user previously granted, or null if no prior grant. */
  userCurrentVersion: string | null;
  /** When the user last took an action (grant or revoke) on this type. */
  userLastActionAt: string | null;
  /** What the user's last action was. Drives the prompt copy. */
  userLastAction: 'granted' | 'revoked' | null;
}

interface PendingMaterialRow {
  consent_type: string;
  latest_version: string;
  effective_at: string;
  change_summary: string;
  user_current_version: string | null;
  user_last_action_at: Date | null;
  user_granted: boolean | null;
}

export async function getPendingMaterialConsents(
  userId: string,
): Promise<PendingMaterialConsent[]> {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw createAppError('userId is required.', 400);
  }

  // The CTE collects, per consent_type, the latest admin_actions row
  // where details.material is the boolean true. Postgres jsonb '?'
  // operator + boolean cast covers both `"material":true` and a stored
  // string "true". DISTINCT ON keeps only the newest publish per type.
  // The LATERAL join then pulls the user's most recent consent_records
  // row for that type so we can decide if a re-consent is needed.
  const sql = `
    WITH latest_material AS (
      SELECT DISTINCT ON (details->>'consentType')
             details->>'consentType'   AS consent_type,
             details->>'version'       AS latest_version,
             COALESCE(details->>'effectiveAt', created_at::text) AS effective_at,
             COALESCE(details->>'changeSummary', '')             AS change_summary,
             created_at                AS published_at
        FROM admin_actions
       WHERE action_type = 'consent_version_published'
         AND target_type = 'consent_version'
         AND (details->>'material')::boolean IS TRUE
       ORDER BY details->>'consentType', created_at DESC
    )
    SELECT lm.consent_type,
           lm.latest_version,
           lm.effective_at,
           lm.change_summary,
           ucr.version       AS user_current_version,
           ucr.granted_at    AS user_last_action_at,
           ucr.granted       AS user_granted
      FROM latest_material lm
      LEFT JOIN LATERAL (
        SELECT version, granted, granted_at
          FROM consent_records
         WHERE user_id = $1
           AND consent_type = lm.consent_type
         ORDER BY granted_at DESC
         LIMIT 1
      ) ucr ON TRUE
     WHERE
       -- User has no record at all for this consentType -> they're a
       -- new user; surface as pending so the prompt explains the
       -- material change before they can grant.
       ucr.version IS NULL
       -- OR they granted an older version -> needs re-consent.
       OR (ucr.granted = TRUE AND ucr.version <> lm.latest_version)
       -- A user who explicitly revoked is not in this list. The
       -- absence covers them.
     ORDER BY lm.published_at DESC
  `;

  const result = await db.query<PendingMaterialRow>(sql, [userId]);

  return result.rows.map((r) => {
    const lastAction: 'granted' | 'revoked' | null =
      r.user_granted === null ? null : r.user_granted ? 'granted' : 'revoked';
    return {
      consentType: r.consent_type,
      latestVersion: r.latest_version,
      effectiveAt: r.effective_at,
      changeSummary: r.change_summary,
      userCurrentVersion: r.user_current_version,
      userLastActionAt: r.user_last_action_at
        ? r.user_last_action_at.toISOString()
        : null,
      userLastAction: lastAction,
    };
  });
}

// LAUNCH-LIMITATIONS #3 fix — customer-facing DSR history.
// Pre-fix: after submitting a DSR the mobile UI showed a one-shot
// confirmation and that was the only visibility — customers had no way
// to see their past requests, status, or due dates without emailing
// the DPO. Post-fix: GET /api/v1/compliance/my-requests returns the
// caller's DSR history (most recent first). Filtered by user_id at the
// service layer so a malicious caller can't enumerate other users'
// requests by passing a forged param.
export async function listMyDsrs(userId: string, limit = 50): Promise<DsrPublicRecord[]> {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw createAppError('userId is required.', 400);
  }
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);
  const result = await db.query<DsrRow>(
    `SELECT ${DSR_COLS}, NULL::text AS user_email
       FROM data_subject_requests
      WHERE user_id = $1
      ORDER BY received_at DESC
      LIMIT ${safeLimit}`,
    [userId],
  );
  return result.rows.map((r) => toPublicDsr(mapDsr(r)));
}

export async function getDsr(id: string): Promise<DsrRecord | null> {
  const result = await db.query<DsrRow>(
    `SELECT ${DSR_COLS_WITH_USER}
       FROM data_subject_requests dsr
       ${DSR_SUBJECT_JOINS}
      WHERE dsr.id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapDsr(row) : null;
}

export async function updateDsrStatus(input: {
  id: string;
  adminId: string;
  newStatus: DsrStatus;
  adminNotes?: string;
  rejectionReason?: string;
  responsePayloadUrl?: string;
}): Promise<DsrRecord> {
  // Load current row first (need old status for transition check + audit).
  const currentResult = await db.query<DsrRow>(
    `SELECT ${DSR_COLS_WITH_USER}
       FROM data_subject_requests dsr
       ${DSR_SUBJECT_JOINS}
      WHERE dsr.id = $1`,
    [input.id],
  );
  const current = currentResult.rows[0];
  if (!current) throw createAppError('Data subject request not found.', 404);

  const oldStatus = current.status;
  const allowed = ALLOWED_TRANSITIONS[oldStatus];
  if (!allowed.has(input.newStatus)) {
    throw createAppError(
      `Invalid status transition: ${oldStatus} → ${input.newStatus}.`,
      400,
    );
  }

  const sets: string[] = ['status = $1', 'handled_by = $2'];
  const params: unknown[] = [input.newStatus, input.adminId];

  if (input.adminNotes !== undefined) {
    params.push(input.adminNotes);
    sets.push(`admin_notes = $${params.length}`);
  }
  if (input.rejectionReason !== undefined) {
    params.push(input.rejectionReason);
    sets.push(`rejection_reason = $${params.length}`);
  }
  if (input.responsePayloadUrl !== undefined) {
    params.push(input.responsePayloadUrl);
    sets.push(`response_payload_url = $${params.length}`);
  }
  // MED-N43 fix — only stamp completed_at on FULFILLED transitions,
  // not on 'rejected'. compliance-admin's rejectDsr also enforces
  // this (MED-N124), but updateDsrStatus is the lower-level path
  // also used directly by routes; keep them consistent.
  if (FULFILLED_STATUSES.has(input.newStatus)) {
    sets.push('completed_at = NOW()');
  }

  params.push(input.id);
  const updateResult = await db.query<DsrRow>(
    `UPDATE data_subject_requests
        SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING ${DSR_COLS}, (SELECT email FROM users WHERE id = data_subject_requests.user_id) AS user_email`,
    params,
  );
  const updated = updateResult.rows[0];
  if (!updated) throw createAppError('Data subject request not found.', 404);

  await writeAudit('dsr.status_changed', 'data_subject_request', updated.id, {
    userId: input.adminId,
    oldValues: { status: oldStatus },
    newValues: {
      status: input.newStatus,
      adminNotes: input.adminNotes,
      rejectionReason: input.rejectionReason,
    },
  });

  logger.info('DSR status changed', {
    id: updated.id, oldStatus, newStatus: input.newStatus, adminId: input.adminId,
  });

  return mapDsr(updated);
}

// ─────────────────────────────────────────────────────────────────
// Audit log CSV export
// ─────────────────────────────────────────────────────────────────

const CSV_HEADER = 'id,source,createdAt,userEmail,userRole,action,entityType,entityId,ipAddress,reason,oldValues,newValues';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Neutralize formula triggers before the comma/quote/newline quoting.
  const s = neutralizeCsvFormula(typeof value === 'string' ? value : String(value));
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * MED-N44 + W12 — CSV is an operations index, not a bulk PII reveal.
 * Email, IP, free-text reasons, and nested old/new JSON remain masked for
 * every role. A raw value must be opened through a record-scoped audited
 * reveal path, never exported as a whole-timeline shortcut.
 *
 * MED-N45 fix — exportAuditLogCsvStream emits a NodeJS.ReadableStream
 * via async-iterator semantics so the CSV is not built fully in
 * memory. exportAuditLogCsv (string-returning) is preserved as a
 * back-compat thin wrapper for existing callers; for very large
 * exports the route should switch to the streaming variant.
 */

function maskEmailForRole(
  email: string | null | undefined,
  _role: string | null | undefined,
): string {
  if (!email) return '';
  // Mask: keep first char + first char of domain.
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const localMask = local.length > 1 ? `${local[0]}***` : '***';
  return `${localMask}@${domain[0] ?? '*'}***`;
}

function maskIpForRole(
  ip: string | null | undefined,
  _role: string | null | undefined,
): string {
  if (!ip) return '';
  // Mask trailing octet for IPv4 (1.2.3.4 → 1.2.3.x); for IPv6 keep
  // first 4 hextets.
  const trimmed = ip.trim();
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    return `${parts.slice(0, 4).join(':')}::****`;
  }
  return '***';
}

interface ExportAuditFilter {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  source?: 'audit_log' | 'admin_actions';
  from?: string;
  to?: string;
  limit?: number;
  /** Role of the admin calling the export (for PII masking). */
  viewerRole?: string;
}

const AUDIT_TIMELINE_RELATION = `
  SELECT 'audit_log'::text AS source,
         id, user_id, action, entity_type, entity_id,
         old_values, new_values, ip_address::text AS ip_address,
         NULL::text AS reason, created_at
    FROM audit_log
  UNION ALL
  SELECT 'admin_actions'::text AS source,
         id, admin_id AS user_id, action_type AS action,
         target_type AS entity_type, target_id AS entity_id,
         NULL::jsonb AS old_values, details AS new_values,
         NULL::text AS ip_address, reason, created_at
    FROM admin_actions
`;

function buildExportWhere(filter: ExportAuditFilter): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.userId) {
    params.push(filter.userId);
    where.push(`combined.user_id = $${params.length}`);
  }
  if (filter.action) {
    params.push(`%${filter.action}%`);
    where.push(`combined.action ILIKE $${params.length}`);
  }
  if (filter.entityType) {
    params.push(filter.entityType);
    where.push(`combined.entity_type = $${params.length}`);
  }
  if (filter.entityId) {
    params.push(filter.entityId);
    where.push(`combined.entity_id = $${params.length}`);
  }
  if (filter.source) {
    params.push(filter.source);
    where.push(`combined.source = $${params.length}`);
  }
  // BUG-PHASE133-01 fix (CSV export) — same Manila-anchored half-open
  // interval as the audit-log listing route. Both surfaces share the
  // same admin-page filter (AuditLogPage.tsx sends the same
  // YYYY-MM-DD `from`/`to` query params to both endpoints).
  if (filter.from) {
    params.push(filter.from);
    where.push(`combined.created_at >= ($${params.length}::date AT TIME ZONE 'Asia/Manila')`);
  }
  if (filter.to) {
    params.push(filter.to);
    where.push(`combined.created_at < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')`);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

function rowToCsvLine(r: AuditLogExportRow, viewerRole?: string): string {
  const oldValues = r.old_values === null || r.old_values === undefined
    ? ''
    : JSON.stringify(maskPiiInObject(r.old_values as Json));
  const newValues = r.new_values === null || r.new_values === undefined
    ? ''
    : JSON.stringify(maskPiiInObject(r.new_values as Json));
  return [
    csvEscape(r.id),
    csvEscape(r.source),
    csvEscape(r.created_at.toISOString()),
    csvEscape(maskEmailForRole(r.user_email, viewerRole)),
    csvEscape(r.user_role),
    csvEscape(r.action),
    csvEscape(r.entity_type),
    csvEscape(r.entity_id),
    csvEscape(maskIpForRole(r.ip_address, viewerRole)),
    csvEscape(r.reason ? maskPiiInString(r.reason) : ''),
    csvEscape(oldValues),
    csvEscape(newValues),
  ].join(',');
}

export async function exportAuditLogCsv(filter: ExportAuditFilter): Promise<string> {
  const { whereSql, params } = buildExportWhere(filter);
  const limit = Math.max(1, Math.min(50000, filter.limit ?? 10000));

  const result = await db.query<AuditLogExportRow>(
    `SELECT combined.id, combined.source, combined.created_at,
            u.email AS user_email, u.role AS user_role,
            combined.action, combined.entity_type, combined.entity_id,
            combined.ip_address, combined.reason,
            combined.old_values, combined.new_values
       FROM (${AUDIT_TIMELINE_RELATION}) combined
       LEFT JOIN users u ON u.id = combined.user_id
       ${whereSql}
      ORDER BY combined.created_at DESC, combined.id DESC
      LIMIT ${limit}`,
    params,
  );

  const lines: string[] = [CSV_HEADER];
  for (const r of result.rows) {
    lines.push(rowToCsvLine(r, filter.viewerRole));
  }
  return lines.join('\r\n');
}

/**
 * MED-N45 — async-iterable variant. Emits CSV header first, then one
 * line per audit row, paginating in chunks of `batchSize` so the
 * CSV is never fully assembled in process memory. Caller pipes
 * directly to a response stream:
 *
 *   for await (const line of exportAuditLogCsvStream(filter)) {
 *     res.write(line);
 *   }
 *   res.end();
 */
export async function* exportAuditLogCsvStream(
  filter: ExportAuditFilter & { batchSize?: number },
): AsyncGenerator<string, void, unknown> {
  const { whereSql, params } = buildExportWhere(filter);
  const totalLimit = Math.max(1, Math.min(500000, filter.limit ?? 100000));
  const batchSize = Math.max(100, Math.min(5000, filter.batchSize ?? 1000));

  yield CSV_HEADER + '\r\n';

  let offset = 0;
  let yielded = 0;
  while (yielded < totalLimit) {
    const remaining = totalLimit - yielded;
    const take = Math.min(batchSize, remaining);
    const result = await db.query<AuditLogExportRow>(
      `SELECT combined.id, combined.source, combined.created_at,
              u.email AS user_email, u.role AS user_role,
              combined.action, combined.entity_type, combined.entity_id,
              combined.ip_address, combined.reason,
              combined.old_values, combined.new_values
         FROM (${AUDIT_TIMELINE_RELATION}) combined
         LEFT JOIN users u ON u.id = combined.user_id
         ${whereSql}
        ORDER BY combined.created_at DESC, combined.id DESC
        LIMIT ${take} OFFSET ${offset}`,
      params,
    );
    if (result.rows.length === 0) return;
    for (const r of result.rows) {
      yield rowToCsvLine(r, filter.viewerRole) + '\r\n';
      yielded += 1;
    }
    offset += result.rows.length;
    if (result.rows.length < take) return;
  }
}

// ─────────────────────────────────────────────────────────────────
// BIR filing calendar (held pending accountant-approved taxpayer profile)
// ─────────────────────────────────────────────────────────────────

export type BirFormStatus = 'not_yet_due' | 'due_soon' | 'overdue';

export interface BirCalendarEntry {
  formNo: string;
  label: string;
  /** ISO date (YYYY-MM-DD) of due date. */
  dueDate: string;
  status: BirFormStatus;
}

export function getBirCalendar(year: number, _now: Date = new Date()): BirCalendarEntry[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw createAppError('year must be an integer between 2000 and 2100.', 400);
  }

  throw createAppError(
    'BIR filing calendar is disabled pending an accountant-approved taxpayer profile and current form schedule (E22).',
    503,
  );
}

// ─────────────────────────────────────────────────────────────────
// DSR alerts (for dashboard)
// ─────────────────────────────────────────────────────────────────

export async function getDsrAlerts(): Promise<DsrRecord[]> {
  const result = await db.query<DsrRow>(
    `SELECT ${DSR_COLS_WITH_USER}
       FROM data_subject_requests dsr
       ${DSR_SUBJECT_JOINS}
      WHERE dsr.status IN ('received', 'in_progress')
        AND dsr.due_at - NOW() <= INTERVAL '2 days'
      ORDER BY dsr.due_at ASC`,
  );
  return result.rows.map((r) => mapDsr(r));
}
