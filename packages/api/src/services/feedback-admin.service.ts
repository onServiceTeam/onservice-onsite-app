import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { maskEmail, maskPhilippinePhone, maskPiiInObject, type Json } from '../utils/pii-mask';
import { logger } from '../utils/logger';

export type FeedbackStatus = 'new' | 'triaged' | 'done' | 'dismissed';

const STATUSES: readonly FeedbackStatus[] = ['new', 'triaged', 'done', 'dismissed'];
const AREAS = ['customer', 'provider', 'admin'] as const;
const TRIAGE_NOTE_MIN = 10;
const TRIAGE_NOTE_MAX = 2_000;

interface FeedbackAdminRow {
  id: string;
  created_at: Date | string;
  updated_at: Date | string;
  tester_name: string | null;
  tester_contact: string | null;
  role: string | null;
  device: string | null;
  areas: string[] | null;
  nps: number | null;
  summary: string | null;
  item_count: number;
  payload: FeedbackPayload | null;
  status: FeedbackStatus;
  assigned_admin_id: string | null;
  triage_note: string | null;
  assigned_first_name: string | null;
  assigned_last_name: string | null;
}

type FeedbackPayload = { [key: string]: Json };

export interface FeedbackAdminRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  testerName: string | null;
  testerContact: string | null;
  contactMasked: boolean;
  role: string | null;
  device: string | null;
  areas: string[];
  nps: number | null;
  summary: string | null;
  itemCount: number;
  payload: FeedbackPayload;
  status: FeedbackStatus;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  triageNote: string | null;
}

export interface FeedbackAdminListResult {
  submissions: FeedbackAdminRecord[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<FeedbackStatus, number>;
}

interface FeedbackHistoryRow {
  id: string;
  created_at: Date | string;
  admin_first_name: string | null;
  admin_last_name: string | null;
  admin_role: string | null;
  previous_status: FeedbackStatus | null;
  next_status: FeedbackStatus;
  previous_owner_first_name: string | null;
  previous_owner_last_name: string | null;
  next_owner_first_name: string | null;
  next_owner_last_name: string | null;
  note: string | null;
}

export interface FeedbackHistoryEntry {
  id: string;
  createdAt: string;
  adminName: string;
  adminRole: string | null;
  previousStatus: FeedbackStatus | null;
  nextStatus: FeedbackStatus;
  previousOwnerName: string | null;
  nextOwnerName: string | null;
  note: string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function maskContact(contact: string | null): string | null {
  if (!contact) return null;
  if (contact.includes('@')) return maskEmail(contact);
  if (contact.replace(/\D/g, '').length >= 4) return maskPhilippinePhone(contact);
  if (contact.length <= 2) return 'masked';
  return `${contact.slice(0, 1)}•••${contact.slice(-1)}`;
}

function mapRow(row: FeedbackAdminRow, actorRole: string): FeedbackAdminRecord {
  const maySeeRawContact = actorRole === 'super_admin';
  const assignedName = [row.assigned_first_name, row.assigned_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    testerName: row.tester_name,
    testerContact: maySeeRawContact ? row.tester_contact : maskContact(row.tester_contact),
    contactMasked: !maySeeRawContact && !!row.tester_contact,
    role: row.role,
    device: row.device,
    areas: row.areas ?? [],
    nps: row.nps,
    summary: row.summary,
    itemCount: row.item_count,
    payload: maySeeRawContact
      ? (row.payload ?? {})
      : maskPiiInObject(row.payload ?? {}),
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    assignedAdminName: assignedName || null,
    triageNote: row.triage_note,
  };
}

const SELECT_COLUMNS = `
  fs.id, fs.created_at, fs.updated_at, fs.tester_name, fs.tester_contact,
  fs.role, fs.device, fs.areas, fs.nps, fs.summary, fs.item_count,
  fs.payload, fs.status, fs.assigned_admin_id, fs.triage_note,
  au.first_name AS assigned_first_name, au.last_name AS assigned_last_name`;

export async function listFeedbackForAdmin(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  area?: string;
  search?: string;
  actorRole: string;
}): Promise<FeedbackAdminListResult> {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const scopeWhere: string[] = [];
  const scopeValues: unknown[] = [];

  if (params.area) {
    if (!(AREAS as readonly string[]).includes(params.area)) {
      throw createAppError('Invalid feedback area.', 400);
    }
    scopeValues.push(params.area);
    scopeWhere.push(`$${scopeValues.length} = ANY(fs.areas)`);
  }
  const search = String(params.search ?? '').trim().slice(0, 100);
  if (search) {
    scopeValues.push(`%${search}%`);
    const p = `$${scopeValues.length}`;
    const contactSearch = params.actorRole === 'super_admin' ? ` OR fs.tester_contact ILIKE ${p}` : '';
    scopeWhere.push(`(fs.summary ILIKE ${p} OR fs.tester_name ILIKE ${p} OR fs.device ILIKE ${p}${contactSearch})`);
  }

  const where = [...scopeWhere];
  const values = [...scopeValues];
  if (params.status) {
    if (!STATUSES.includes(params.status as FeedbackStatus)) {
      throw createAppError('Invalid feedback status.', 400);
    }
    values.push(params.status);
    where.push(`fs.status = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const scopeWhereSql = scopeWhere.length ? `WHERE ${scopeWhere.join(' AND ')}` : '';
  const [countResult, rowsResult, statusResult] = await Promise.all([
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM feedback_submissions fs ${whereSql}`,
      values,
    ),
    db.query<FeedbackAdminRow>(
      `SELECT ${SELECT_COLUMNS.replace('fs.payload', "'{}'::jsonb AS payload")}
         FROM feedback_submissions fs
         LEFT JOIN users au ON au.id = fs.assigned_admin_id
         ${whereSql}
        ORDER BY CASE fs.status WHEN 'new' THEN 0 WHEN 'triaged' THEN 1 ELSE 2 END,
                 fs.created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    db.query<{ status: FeedbackStatus; count: string }>(
      `SELECT status, COUNT(*)::text AS count
         FROM feedback_submissions fs
         ${scopeWhereSql}
        GROUP BY status`,
      scopeValues,
    ),
  ]);

  const counts: Record<FeedbackStatus, number> = { new: 0, triaged: 0, done: 0, dismissed: 0 };
  for (const row of statusResult.rows) counts[row.status] = Number(row.count);

  return {
    submissions: rowsResult.rows.map((row) => mapRow(row, params.actorRole)),
    total: Number(countResult.rows[0]?.count ?? 0),
    page,
    pageSize,
    counts,
  };
}

export async function getFeedbackForAdmin(
  feedbackId: string,
  actorRole: string,
): Promise<FeedbackAdminRecord> {
  const result = await db.query<FeedbackAdminRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM feedback_submissions fs
       LEFT JOIN users au ON au.id = fs.assigned_admin_id
      WHERE fs.id = $1`,
    [feedbackId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Feedback submission not found.', 404);
  return mapRow(row, actorRole);
}

export async function getFeedbackHistoryForAdmin(feedbackId: string): Promise<FeedbackHistoryEntry[]> {
  const result = await db.query<FeedbackHistoryRow>(
    `SELECT al.id, al.created_at,
            actor.first_name AS admin_first_name,
            actor.last_name AS admin_last_name,
            actor.role AS admin_role,
            al.old_values->>'status' AS previous_status,
            al.new_values->>'status' AS next_status,
            previous_owner.first_name AS previous_owner_first_name,
            previous_owner.last_name AS previous_owner_last_name,
            next_owner.first_name AS next_owner_first_name,
            next_owner.last_name AS next_owner_last_name,
            al.new_values->>'triageNote' AS note
       FROM audit_log al
       LEFT JOIN users actor ON actor.id = al.user_id
       LEFT JOIN users previous_owner
         ON previous_owner.id = NULLIF(al.old_values->>'assignedAdminId', '')::uuid
       LEFT JOIN users next_owner
         ON next_owner.id = NULLIF(al.new_values->>'assignedAdminId', '')::uuid
      WHERE al.entity_type = 'feedback_submission'
        AND al.entity_id = $1
        AND al.action = 'feedback_submission_updated'
      ORDER BY al.created_at DESC
      LIMIT 100`,
    [feedbackId],
  );

  const name = (first: string | null, last: string | null): string | null => {
    const value = [first, last].filter(Boolean).join(' ').trim();
    return value || null;
  };
  return result.rows.map((row) => ({
    id: row.id,
    createdAt: iso(row.created_at),
    adminName: name(row.admin_first_name, row.admin_last_name) ?? 'Unknown admin',
    adminRole: row.admin_role,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    previousOwnerName: name(row.previous_owner_first_name, row.previous_owner_last_name),
    nextOwnerName: name(row.next_owner_first_name, row.next_owner_last_name),
    note: row.note ?? '',
  }));
}

export async function updateFeedbackTriage(params: {
  feedbackId: string;
  adminId: string;
  actorRole: string;
  status: string;
  assignedAdminId: string | null;
  note: string;
}): Promise<FeedbackAdminRecord> {
  if (!STATUSES.includes(params.status as FeedbackStatus)) {
    throw createAppError('Invalid feedback status.', 400);
  }
  const note = String(params.note ?? '').trim();
  if (note.length < TRIAGE_NOTE_MIN) {
    throw createAppError(`A triage note of at least ${TRIAGE_NOTE_MIN} characters is required.`, 400);
  }
  if (note.length > TRIAGE_NOTE_MAX) {
    throw createAppError(`Triage note must be ${TRIAGE_NOTE_MAX} characters or fewer.`, 400);
  }
  if ((params.status === 'triaged' || params.status === 'done') && !params.assignedAdminId) {
    throw createAppError('An owner is required for triaged or completed feedback.', 400);
  }

  await db.transaction(async (client) => {
    const currentResult = await client.query<{
      status: FeedbackStatus;
      assigned_admin_id: string | null;
      triage_note: string | null;
    }>(
      `SELECT status, assigned_admin_id, triage_note
         FROM feedback_submissions
        WHERE id = $1
        FOR UPDATE`,
      [params.feedbackId],
    );
    const current = currentResult.rows[0];
    if (!current) throw createAppError('Feedback submission not found.', 404);
    if (
      current.status === params.status
      && current.assigned_admin_id === params.assignedAdminId
      && (current.triage_note ?? '') === note
    ) {
      throw createAppError('Feedback triage already has those values.', 409);
    }

    if (params.assignedAdminId) {
      const agent = await client.query<{ id: string }>(
        `SELECT id FROM users
          WHERE id = $1
            AND is_active = TRUE
            AND role IN ('admin', 'super_admin')`,
        [params.assignedAdminId],
      );
      if (!agent.rows[0]) {
        throw createAppError('Selected feedback owner is not active or assignable.', 400);
      }
    }

    await client.query(
      `UPDATE feedback_submissions
          SET status = $2,
              assigned_admin_id = $3,
              triage_note = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [params.feedbackId, params.status, params.assignedAdminId, note],
    );

    await client.query(
      `INSERT INTO audit_log
         (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'feedback_submission_updated', 'feedback_submission', $2, $3::jsonb, $4::jsonb)`,
      [
        params.adminId,
        params.feedbackId,
        JSON.stringify({
          status: current.status,
          assignedAdminId: current.assigned_admin_id,
          triageNote: current.triage_note,
        }),
        JSON.stringify({
          status: params.status,
          assignedAdminId: params.assignedAdminId,
          triageNote: note,
        }),
      ],
    );
  });

  logger.info('Tester feedback triage updated', {
    feedbackId: params.feedbackId,
    status: params.status,
    assignedAdminId: params.assignedAdminId,
    adminId: params.adminId,
  });
  return getFeedbackForAdmin(params.feedbackId, params.actorRole);
}
