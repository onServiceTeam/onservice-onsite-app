/**
 * Phase 11 — Compliance service.
 *
 * Pure, hermetic-friendly functions wrapping the consent_records and
 * data_subject_requests tables (migration 057). Plus utility helpers:
 *   - exportAuditLogCsv: streams a CSV of audit_log rows (RFC 4180).
 *   - getBirCalendar: pure date-math, returns BIR filing schedule status.
 *   - getDsrAlerts: DSRs due in <= 2 days, used by dashboard.
 *
 * Audit: every state-changing function writes a paired audit_log entry.
 * The insert is wrapped in try/catch + logger.warn so a failed audit row
 * never causes the main write to fail.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type DsrRequestType =
  | 'access' | 'erasure' | 'correction' | 'portability' | 'restriction' | 'objection';

export type DsrStatus = 'received' | 'in_progress' | 'completed' | 'rejected';

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: string;
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
  requestType: DsrRequestType;
  status: DsrStatus;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
  handledBy: string | null;
  userMessage: string | null;
  adminNotes: string | null;
  responsePayloadUrl: string | null;
  rejectionReason: string | null;
  daysUntilDue: number;
  isOverdue: boolean;
}

interface ConsentRow {
  id: string;
  user_id: string;
  consent_type: string;
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
  request_type: DsrRequestType;
  status: DsrStatus;
  received_at: Date;
  due_at: Date;
  completed_at: Date | null;
  handled_by: string | null;
  user_message: string | null;
  admin_notes: string | null;
  response_payload_url: string | null;
  rejection_reason: string | null;
}

interface AuditLogExportRow {
  id: string;
  created_at: Date;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  old_values: unknown;
  new_values: unknown;
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

const TERMINAL_STATUSES: ReadonlySet<DsrStatus> = new Set(['completed', 'rejected']);

const CONSENT_COLS = `id, user_id, consent_type, version, granted,
       granted_at, revoked_at, ip_address::text AS ip_address, user_agent`;

const DSR_COLS = `id, user_id, request_type, status,
       received_at, due_at, completed_at, handled_by,
       user_message, admin_notes, response_payload_url, rejection_reason`;

const DSR_COLS_WITH_USER = `dsr.id, dsr.user_id, u.email AS user_email,
       dsr.request_type, dsr.status,
       dsr.received_at, dsr.due_at, dsr.completed_at, dsr.handled_by,
       dsr.user_message, dsr.admin_notes, dsr.response_payload_url, dsr.rejection_reason`;

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
    requestType: r.request_type,
    status: r.status,
    receivedAt: r.received_at.toISOString(),
    dueAt: r.due_at.toISOString(),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    handledBy: r.handled_by,
    userMessage: r.user_message,
    adminNotes: r.admin_notes,
    responsePayloadUrl: r.response_payload_url,
    rejectionReason: r.rejection_reason,
    daysUntilDue,
    isOverdue: !isTerminal && diffMs < 0,
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
  return mapDsr(row);
}

export async function listDsrs(filter: {
  status?: DsrStatus;
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
       LEFT JOIN users u ON u.id = dsr.user_id
       ${whereSql}
      ORDER BY dsr.due_at ASC, dsr.received_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows: rowsResult.rows.map((r) => mapDsr(r)), total };
}

export async function getDsr(id: string): Promise<DsrRecord | null> {
  const result = await db.query<DsrRow>(
    `SELECT ${DSR_COLS_WITH_USER}
       FROM data_subject_requests dsr
       LEFT JOIN users u ON u.id = dsr.user_id
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
       LEFT JOIN users u ON u.id = dsr.user_id
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
  if (TERMINAL_STATUSES.has(input.newStatus)) {
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

const CSV_HEADER = 'id,createdAt,userEmail,userRole,action,entityType,entityId,ipAddress,oldValues,newValues';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportAuditLogCsv(filter: {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<string> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.userId) {
    params.push(filter.userId);
    where.push(`al.user_id = $${params.length}`);
  }
  if (filter.action) {
    params.push(`%${filter.action}%`);
    where.push(`al.action ILIKE $${params.length}`);
  }
  if (filter.entityType) {
    params.push(filter.entityType);
    where.push(`al.entity_type = $${params.length}`);
  }
  if (filter.from) {
    params.push(filter.from);
    where.push(`al.created_at >= $${params.length}`);
  }
  if (filter.to) {
    params.push(filter.to);
    where.push(`al.created_at <= $${params.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(50000, filter.limit ?? 10000));

  const result = await db.query<AuditLogExportRow>(
    `SELECT al.id, al.created_at,
            u.email AS user_email, u.role AS user_role,
            al.action, al.entity_type, al.entity_id,
            al.ip_address::text AS ip_address,
            al.old_values, al.new_values
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereSql}
      ORDER BY al.created_at DESC
      LIMIT ${limit}`,
    params,
  );

  const lines: string[] = [CSV_HEADER];
  for (const r of result.rows) {
    lines.push([
      csvEscape(r.id),
      csvEscape(r.created_at.toISOString()),
      csvEscape(r.user_email),
      csvEscape(r.user_role),
      csvEscape(r.action),
      csvEscape(r.entity_type),
      csvEscape(r.entity_id),
      csvEscape(r.ip_address),
      csvEscape(r.old_values === null || r.old_values === undefined ? '' : JSON.stringify(r.old_values)),
      csvEscape(r.new_values === null || r.new_values === undefined ? '' : JSON.stringify(r.new_values)),
    ].join(','));
  }
  return lines.join('\r\n');
}

// ─────────────────────────────────────────────────────────────────
// BIR filing calendar (pure)
// ─────────────────────────────────────────────────────────────────

export type BirFormStatus = 'not_yet_due' | 'due_soon' | 'overdue';

export interface BirCalendarEntry {
  formNo: string;
  label: string;
  /** ISO date (YYYY-MM-DD) of due date. */
  dueDate: string;
  status: BirFormStatus;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function statusFor(due: Date, now: Date): BirFormStatus {
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  if (diffMs < 0) return 'overdue';
  if (diffDays <= 7) return 'due_soon';
  return 'not_yet_due';
}

export function getBirCalendar(year: number, now: Date = new Date()): BirCalendarEntry[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw createAppError('year must be an integer between 2000 and 2100.', 400);
  }

  const entries: BirCalendarEntry[] = [];

  // 1601-EQ: monthly withholding, due 10th of next month.
  for (let m = 0; m < 12; m++) {
    const due = new Date(Date.UTC(year, m + 1, 10));
    entries.push({
      formNo: '1601-EQ',
      label: `1601-EQ — Withholding (period ${year}-${String(m + 1).padStart(2, '0')})`,
      dueDate: isoDate(due),
      status: statusFor(due, now),
    });
  }

  // 2550M: monthly VAT, due 20th of next month.
  for (let m = 0; m < 12; m++) {
    const due = new Date(Date.UTC(year, m + 1, 20));
    entries.push({
      formNo: '2550M',
      label: `2550M — Monthly VAT (period ${year}-${String(m + 1).padStart(2, '0')})`,
      dueDate: isoDate(due),
      status: statusFor(due, now),
    });
  }

  // 1701Q quarterly:
  //   Q1 (period Jan-Mar) due May 15
  //   Q2 (period Apr-Jun) due Aug 15
  //   Q3 (period Jul-Sep) due Nov 15
  //   Q4/annual (period Oct-Dec) due Apr 15 of next year
  const quarterly: Array<{ period: string; due: Date }> = [
    { period: 'Q1', due: new Date(Date.UTC(year, 4, 15)) },
    { period: 'Q2', due: new Date(Date.UTC(year, 7, 15)) },
    { period: 'Q3', due: new Date(Date.UTC(year, 10, 15)) },
    { period: 'Q4', due: new Date(Date.UTC(year + 1, 3, 15)) },
  ];
  for (const q of quarterly) {
    entries.push({
      formNo: '1701Q',
      label: `1701Q — Quarterly Income (${year} ${q.period})`,
      dueDate: isoDate(q.due),
      status: statusFor(q.due, now),
    });
  }

  // 1701: annual income tax, due Apr 15 of next year.
  const annualDue = new Date(Date.UTC(year + 1, 3, 15));
  entries.push({
    formNo: '1701',
    label: `1701 — Annual Income (${year})`,
    dueDate: isoDate(annualDue),
    status: statusFor(annualDue, now),
  });

  entries.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return entries;
}

// ─────────────────────────────────────────────────────────────────
// DSR alerts (for dashboard)
// ─────────────────────────────────────────────────────────────────

export async function getDsrAlerts(): Promise<DsrRecord[]> {
  const result = await db.query<DsrRow>(
    `SELECT ${DSR_COLS_WITH_USER}
       FROM data_subject_requests dsr
       LEFT JOIN users u ON u.id = dsr.user_id
      WHERE dsr.status IN ('received', 'in_progress')
        AND dsr.due_at - NOW() <= INTERVAL '2 days'
      ORDER BY dsr.due_at ASC`,
  );
  return result.rows.map((r) => mapDsr(r));
}
