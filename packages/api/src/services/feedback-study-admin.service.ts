// Tester feedback version 2: admin side (overview, problems, sessions,
// triage, screenshots) and the private export.
//
// Ordinary admins see free text with phone numbers and emails masked, and no
// tester name or contact. Super admins see everything. Every triage change
// writes an audit_log row in the same transaction.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import { feedbackUploadDir } from './feedback-study.service';
import { createAppError } from '../middleware/error.middleware';
import { maskPiiInString } from '../utils/pii-mask';
import { publicStudy, MISSIONS, SCREENS } from '../config/feedback-study';
import { getFeedbackScreenshotStream } from './feedback-screenshot.service';
import type { ObjectStream } from './upload.service';

export const PROBLEM_STATUSES = ['new', 'triaged', 'planned', 'done', 'dismissed', 'duplicate'] as const;
export type ProblemStatus = typeof PROBLEM_STATUSES[number];

type Json = Record<string, unknown>;

interface EntryRow {
  id: string;
  session_id: string;
  kind: string;
  item_key: string;
  created_at: Date;
  updated_at: Date;
  mission_outcome: string | null;
  seq: number | null;
  severity: string | null;
  screen_key: string | null;
  screen_route: string | null;
  app_version: string | null;
  answers: Json;
  sus: number[] | null;
  sus_score: string | null;
  prices: Json | null;
  screenshots: string[];
  status: ProblemStatus;
  duplicate_of: string | null;
  assigned_admin_id: string | null;
  triage_note: string | null;
}

interface SessionRow {
  id: string;
  created_at: Date;
  updated_at: Date;
  study_version: string;
  role: string;
  device_kind: string | null;
  app_surface: string | null;
  platform_detail: string | null;
  app_version: string | null;
  help_methods: string[];
  tester_name: string | null;
  tester_contact: string | null;
  completed_at: Date | null;
  status: string;
}

const isSuper = (role: string) => role === 'super_admin';

function maskAnswers(answers: Json, role: string): Json {
  if (isSuper(role)) return answers;
  return Object.fromEntries(Object.entries(answers).map(([key, value]) =>
    [key, typeof value === 'string' ? maskPiiInString(value) : value]));
}

function shapeEntry(row: EntryRow, role: string) {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    itemKey: row.item_key,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    missionOutcome: row.mission_outcome,
    seq: row.seq,
    severity: row.severity,
    screenKey: row.screen_key,
    screenName: SCREENS.find(s => s.key === row.screen_key)?.name ?? null,
    screenRoute: row.screen_route,
    appVersion: row.app_version,
    answers: maskAnswers(row.answers, role),
    sus: row.sus,
    susScore: row.sus_score === null ? null : Number(row.sus_score),
    prices: row.prices,
    screenshots: row.screenshots,
    status: row.status,
    duplicateOf: row.duplicate_of,
    assignedAdminId: row.assigned_admin_id,
    triageNote: row.triage_note === null || isSuper(role) ? row.triage_note : maskPiiInString(row.triage_note),
  };
}

function shapeSession(row: SessionRow, role: string) {
  return {
    id: row.id,
    label: `Tester ${row.id.slice(0, 6)}`,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    studyVersion: row.study_version,
    role: row.role,
    deviceKind: row.device_kind,
    appSurface: row.app_surface,
    platformDetail: row.platform_detail,
    appVersion: row.app_version,
    helpMethods: row.help_methods,
    testerName: isSuper(role) ? row.tester_name : null,
    testerContact: isSuper(role) ? row.tester_contact : null,
    hasContact: Boolean(row.tester_name || row.tester_contact),
    completedAt: row.completed_at?.toISOString() ?? null,
    status: row.status,
  };
}

const SESSION_COLUMNS = `id, created_at, updated_at, study_version, role, device_kind, app_surface, platform_detail,
  app_version, help_methods, tester_name, tester_contact, completed_at, status`;

/** The numbers a market-research summary starts from. Dismissed sessions are left out. */
export async function feedbackOverview() {
  const sessions = (await db.query<{ role: string; status: string; n: string }>(
    `SELECT role, status, count(*)::text AS n FROM feedback_sessions WHERE status <> 'dismissed' GROUP BY role, status`,
  )).rows;
  const missions = (await db.query<{ item_key: string; outcome: string; n: string; seq_sum: string; seq_n: string }>(
    `SELECT e.item_key, e.mission_outcome AS outcome, count(*)::text AS n,
            COALESCE(sum(e.seq), 0)::text AS seq_sum, count(e.seq)::text AS seq_n
       FROM feedback_entries e JOIN feedback_sessions s ON s.id = e.session_id
      WHERE e.kind = 'mission' AND s.status <> 'dismissed'
      GROUP BY e.item_key, e.mission_outcome`,
  )).rows;
  const sus = (await db.query<{ n: string; mean: string | null; min: string | null; max: string | null }>(
    `SELECT count(*)::text AS n, round(avg(e.sus_score), 1)::text AS mean,
            min(e.sus_score)::text AS min, max(e.sus_score)::text AS max
       FROM feedback_entries e JOIN feedback_sessions s ON s.id = e.session_id
      WHERE e.kind = 'wrapup' AND e.sus_score IS NOT NULL AND s.status <> 'dismissed'`,
  )).rows[0]!;
  const screens = (await db.query<{ screen_key: string | null; severity: string; reports: string; testers: string }>(
    `SELECT e.screen_key, e.severity, count(*)::text AS reports, count(DISTINCT e.session_id)::text AS testers
       FROM feedback_entries e JOIN feedback_sessions s ON s.id = e.session_id
      WHERE e.kind = 'problem' AND e.status NOT IN ('dismissed', 'duplicate') AND s.status <> 'dismissed'
      GROUP BY e.screen_key, e.severity`,
  )).rows;

  const missionStats = MISSIONS.map(mission => {
    const rows = missions.filter(r => r.item_key === mission.key);
    const count = (outcome: string) => Number(rows.find(r => r.outcome === outcome)?.n ?? 0);
    const answered = rows.reduce((total, r) => total + Number(r.n), 0);
    const seqTotal = rows.reduce((total, r) => total + Number(r.seq_sum), 0);
    const seqCount = rows.reduce((total, r) => total + Number(r.seq_n), 0);
    return {
      key: mission.key, role: mission.role, title: mission.title, answered,
      done: count('done'), partly: count('partly'), no: count('no'), gaveUp: count('gave_up'),
      completionRate: answered ? Math.round((count('done') / answered) * 100) : null,
      averageEase: seqCount ? Math.round((seqTotal / seqCount) * 10) / 10 : null,
    };
  });

  const byScreen = new Map<string, { screenKey: string | null; screenName: string; reports: number; testers: number; bySeverity: Record<string, number> }>();
  for (const row of screens) {
    const key = row.screen_key ?? '';
    const current = byScreen.get(key) ?? {
      screenKey: row.screen_key,
      screenName: SCREENS.find(s => s.key === row.screen_key)?.name ?? 'Screen not given',
      reports: 0, testers: 0, bySeverity: {},
    };
    current.reports += Number(row.reports);
    // Distinct testers per severity can overlap; the per-screen figure below
    // is recomputed exactly.
    current.bySeverity[row.severity] = (current.bySeverity[row.severity] ?? 0) + Number(row.reports);
    byScreen.set(key, current);
  }
  const testersPerScreen = (await db.query<{ screen_key: string | null; testers: string }>(
    `SELECT e.screen_key, count(DISTINCT e.session_id)::text AS testers
       FROM feedback_entries e JOIN feedback_sessions s ON s.id = e.session_id
      WHERE e.kind = 'problem' AND e.status NOT IN ('dismissed', 'duplicate') AND s.status <> 'dismissed'
      GROUP BY e.screen_key`,
  )).rows;
  for (const row of testersPerScreen) {
    const current = byScreen.get(row.screen_key ?? '');
    if (current) current.testers = Number(row.testers);
  }

  return {
    sessions: {
      total: sessions.reduce((total, r) => total + Number(r.n), 0),
      completed: sessions.filter(r => r.status === 'completed').reduce((total, r) => total + Number(r.n), 0),
      byRole: Object.fromEntries(['customer', 'provider', 'both'].map(role =>
        [role, sessions.filter(r => r.role === role).reduce((total, r) => total + Number(r.n), 0)])),
    },
    missions: missionStats,
    sus: {
      responses: Number(sus.n),
      average: sus.mean === null ? null : Number(sus.mean),
      lowest: sus.min === null ? null : Number(sus.min),
      highest: sus.max === null ? null : Number(sus.max),
    },
    problemsByScreen: [...byScreen.values()].sort((a, b) => b.testers - a.testers || b.reports - a.reports),
  };
}

export async function listProblems(params: {
  role: string; status?: string; severity?: string; screenKey?: string; page: number; pageSize: number;
}) {
  const where: string[] = ["e.kind = 'problem'"];
  const values: unknown[] = [];
  if (params.status) { values.push(params.status); where.push(`e.status = $${values.length}`); }
  if (params.severity) { values.push(params.severity); where.push(`e.severity = $${values.length}`); }
  if (params.screenKey) { values.push(params.screenKey); where.push(`e.screen_key = $${values.length}`); }
  const filter = where.join(' AND ');
  const total = Number((await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM feedback_entries e WHERE ${filter}`, values,
  )).rows[0]!.n);
  values.push(params.pageSize, (params.page - 1) * params.pageSize);
  const rows = (await db.query<EntryRow & { session_role: string }>(
    `SELECT e.*, s.role AS session_role FROM feedback_entries e JOIN feedback_sessions s ON s.id = e.session_id
      WHERE ${filter}
      ORDER BY CASE e.severity WHEN 'stopped' THEN 0 WHEN 'slowed' THEN 1 WHEN 'annoyed' THEN 2 ELSE 3 END,
               e.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
  )).rows;
  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    problems: rows.map(row => ({ ...shapeEntry(row, params.role), sessionRole: row.session_role })),
  };
}

export async function getSessionForAdmin(sessionId: string, role: string) {
  const session = (await db.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM feedback_sessions WHERE id = $1`, [sessionId])).rows[0];
  if (!session) throw createAppError('Tester session not found.', 404);
  const entries = (await db.query<EntryRow>(
    'SELECT * FROM feedback_entries WHERE session_id = $1 ORDER BY created_at', [sessionId],
  )).rows;
  return { session: shapeSession(session, role), entries: entries.map(row => shapeEntry(row, role)) };
}

export async function listSessions(params: { role: string; page: number; pageSize: number }) {
  const total = Number((await db.query<{ n: string }>('SELECT count(*)::text AS n FROM feedback_sessions')).rows[0]!.n);
  const rows = (await db.query<SessionRow & { missions: string; problems: string }>(
    `SELECT ${SESSION_COLUMNS.split(',').map(c => `s.${c.trim()}`).join(', ')},
            count(e.id) FILTER (WHERE e.kind = 'mission')::text AS missions,
            count(e.id) FILTER (WHERE e.kind = 'problem')::text AS problems
       FROM feedback_sessions s LEFT JOIN feedback_entries e ON e.session_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
    [params.pageSize, (params.page - 1) * params.pageSize],
  )).rows;
  return {
    total, page: params.page, pageSize: params.pageSize,
    sessions: rows.map(row => ({ ...shapeSession(row, params.role), missions: Number(row.missions), problems: Number(row.problems) })),
  };
}

export async function triageProblem(params: {
  entryId: string; adminId: string; actorRole: string; status: ProblemStatus;
  assignedAdminId: string | null; note: string; duplicateOf: string | null; expectedUpdatedAt: string;
}) {
  if (!PROBLEM_STATUSES.includes(params.status)) throw createAppError('Invalid problem status.', 400);
  const note = String(params.note ?? '').trim();
  if (note.length < 10 || note.length > 2000) throw createAppError('Please write a note of 10 to 2000 characters.', 400);
  if ((params.status === 'duplicate') !== Boolean(params.duplicateOf)) {
    throw createAppError('Choose the original report when marking a duplicate, and only then.', 400);
  }
  if (['triaged', 'planned', 'done'].includes(params.status) && !params.assignedAdminId) {
    throw createAppError('Choose an owner before moving a problem forward.', 400);
  }
  const expected = Date.parse(params.expectedUpdatedAt);
  if (!Number.isFinite(expected)) throw createAppError('Reload the problem and try again.', 400);

  await db.transaction(async client => {
    const current = (await client.query<EntryRow>(
      "SELECT * FROM feedback_entries WHERE id = $1 AND kind = 'problem' FOR UPDATE", [params.entryId],
    )).rows[0];
    if (!current) throw createAppError('Problem report not found.', 404);
    if (current.updated_at.getTime() !== expected) {
      throw createAppError('This problem changed after you opened it. Reload it to see the newer decision.', 409);
    }
    if (params.duplicateOf) {
      if (params.duplicateOf === params.entryId) throw createAppError('A report cannot duplicate itself.', 400);
      const original = (await client.query<{ status: string }>(
        "SELECT status FROM feedback_entries WHERE id = $1 AND kind = 'problem'", [params.duplicateOf],
      )).rows[0];
      if (!original) throw createAppError('The original report was not found.', 400);
      if (original.status === 'duplicate') throw createAppError('Point to the original report, not to another duplicate.', 400);
    }
    if (params.assignedAdminId) {
      const owner = await client.query(
        "SELECT 1 FROM users WHERE id = $1 AND is_active = TRUE AND role IN ('admin', 'super_admin')", [params.assignedAdminId],
      );
      if (!owner.rowCount) throw createAppError('That owner is not an active admin.', 400);
    }
    await client.query(
      `UPDATE feedback_entries SET status = $2, assigned_admin_id = $3, triage_note = $4, duplicate_of = $5,
         updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 millisecond')
       WHERE id = $1`,
      [params.entryId, params.status, params.assignedAdminId, note, params.duplicateOf],
    );
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'feedback_problem_updated', 'feedback_entry', $2, $3::jsonb, $4::jsonb)`,
      [params.adminId, params.entryId,
        JSON.stringify({ status: current.status, assignedAdminId: current.assigned_admin_id,
          triageNote: current.triage_note, duplicateOf: current.duplicate_of }),
        JSON.stringify({ status: params.status, assignedAdminId: params.assignedAdminId,
          triageNote: note, duplicateOf: params.duplicateOf })],
    );
  });
  const row = (await db.query<EntryRow>('SELECT * FROM feedback_entries WHERE id = $1', [params.entryId])).rows[0]!;
  return shapeEntry(row, params.actorRole);
}

/** Marks a whole tester session as junk (it then drops out of every number). */
export async function setSessionDismissed(params: { sessionId: string; adminId: string; dismissed: boolean; note: string }) {
  const note = String(params.note ?? '').trim();
  if (note.length < 10 || note.length > 2000) throw createAppError('Please write a note of 10 to 2000 characters.', 400);
  await db.transaction(async client => {
    const current = (await client.query<{ status: string; completed_at: Date | null }>(
      'SELECT status, completed_at FROM feedback_sessions WHERE id = $1 FOR UPDATE', [params.sessionId],
    )).rows[0];
    if (!current) throw createAppError('Tester session not found.', 404);
    const next = params.dismissed ? 'dismissed' : (current.completed_at ? 'completed' : 'active');
    if (next === current.status) throw createAppError('The session already has that status.', 409);
    await client.query('UPDATE feedback_sessions SET status = $2, updated_at = NOW() WHERE id = $1', [params.sessionId, next]);
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'feedback_session_updated', 'feedback_session', $2, $3::jsonb, $4::jsonb)`,
      [params.adminId, params.sessionId, JSON.stringify({ status: current.status }), JSON.stringify({ status: next, note })],
    );
  });
}

export async function getEntryScreenshotForAdmin(entryId: string, filename: string): Promise<ObjectStream> {
  const row = (await db.query<{ screenshots: string[] }>(
    'SELECT screenshots FROM feedback_entries WHERE id = $1', [entryId],
  )).rows[0];
  if (!row || !row.screenshots.includes(filename)) throw createAppError('Feedback screenshot not found.', 404);
  return getFeedbackScreenshotStream(filename);
}

/** Everything, unmasked, for the key-protected private pull. */
export async function exportStudyData() {
  const sessions = (await db.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM feedback_sessions ORDER BY created_at`)).rows;
  const entries = (await db.query<EntryRow>('SELECT * FROM feedback_entries ORDER BY created_at')).rows;
  return {
    exportedAt: new Date().toISOString(),
    study: publicStudy(),
    overview: await feedbackOverview(),
    sessions: sessions.map(row => shapeSession(row, 'super_admin')),
    entries: entries.map(row => shapeEntry(row, 'super_admin')),
  };
}

/** The triage history of one problem report, oldest first, from audit_log. */
export async function problemHistory(entryId: string, role: string) {
  const exists = await db.query("SELECT 1 FROM feedback_entries WHERE id = $1 AND kind = 'problem'", [entryId]);
  if (!exists.rowCount) throw createAppError('Problem report not found.', 404);
  const rows = (await db.query<{ created_at: Date; user_id: string | null; first_name: string | null; last_name: string | null;
    old_values: Json | null; new_values: Json | null }>(
    `SELECT a.created_at, a.user_id, u.first_name, u.last_name, a.old_values, a.new_values
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entity_type = 'feedback_entry' AND a.entity_id = $1 AND a.action = 'feedback_problem_updated'
      ORDER BY a.created_at, a.id`, [entryId],
  )).rows;
  const note = (value: unknown) => (typeof value === 'string' && !isSuper(role) ? maskPiiInString(value) : value ?? null);
  return rows.map(row => ({
    at: row.created_at.toISOString(),
    adminId: row.user_id,
    adminName: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
    from: row.old_values ? { ...row.old_values, triageNote: note(row.old_values.triageNote) } : null,
    to: row.new_values ? { ...row.new_values, triageNote: note(row.new_values.triageNote) } : null,
  }));
}

/**
 * Erases one tester's session completely: answers, problem reports, upload
 * records and screenshot files (a tester's deletion request). Reports from
 * other testers that were marked as duplicates of this tester's reports go
 * back to "new". The audit row keeps counts only, never content.
 */
export async function eraseSession(params: { sessionId: string; adminId: string; note: string }): Promise<{ entries: number; screenshots: number }> {
  const note = String(params.note ?? '').trim();
  if (note.length < 10 || note.length > 2000) throw createAppError('Please write a note of 10 to 2000 characters.', 400);
  const files = await db.transaction(async client => {
    const session = await client.query('SELECT 1 FROM feedback_sessions WHERE id = $1 FOR UPDATE', [params.sessionId]);
    if (!session.rowCount) throw createAppError('Tester session not found.', 404);
    const uploads = (await client.query<{ filename: string }>(
      'SELECT filename FROM feedback_uploads WHERE session_id = $1', [params.sessionId])).rows.map(r => r.filename);
    const reopened = await client.query(
      `UPDATE feedback_entries SET status = 'new', duplicate_of = NULL, updated_at = NOW()
        WHERE duplicate_of IN (SELECT id FROM feedback_entries WHERE session_id = $1) AND session_id <> $1`,
      [params.sessionId],
    );
    const entries = Number((await client.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM feedback_entries WHERE session_id = $1', [params.sessionId])).rows[0]!.n);
    await client.query('DELETE FROM feedback_sessions WHERE id = $1', [params.sessionId]);
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'feedback_session_erased', 'feedback_session', $2, $3::jsonb, $4::jsonb)`,
      [params.adminId, params.sessionId, JSON.stringify({ entries, screenshots: uploads.length }),
        JSON.stringify({ note, duplicatesReopened: reopened.rowCount ?? 0 })],
    );
    return { entries, uploads };
  });
  // Files go after the commit: if one cannot be deleted it is logged; the
  // database no longer references it, so no route can serve it.
  for (const filename of files.uploads) {
    try {
      await fs.unlink(path.join(feedbackUploadDir(), filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('feedback erase could not delete a screenshot file', { filename });
      }
    }
  }
  return { entries: files.entries, screenshots: files.uploads.length };
}
