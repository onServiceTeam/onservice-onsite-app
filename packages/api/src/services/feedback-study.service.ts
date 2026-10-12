// Tester feedback version 2: public side (sessions, answers, screenshots).
//
// A tester starts a session (no account), gets a random resume token, and
// saves each piece as soon as it is finished. Everything is validated against
// the versioned study definition in config/feedback-study.ts.

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { getUploadDir } from './upload.service';
import { stripImageMetadata } from '../utils/image-metadata';
import { logger } from '../utils/logger';
import {
  STUDY_VERSION, MISSIONS, MISSION_QUESTIONS, FIRST_IMPRESSION_QUESTIONS, PROBLEM_QUESTIONS,
  WRAPUP_QUESTIONS, SEVERITIES, HELP_METHODS, PRICE_SERVICES, PRICE_POINTS, SCREENS, SUS_ITEMS,
  susScore, type StudyQuestion,
} from '../config/feedback-study';

export const FEEDBACK_LIMITS = {
  uploadsPerSession: 60,
  problemsPerSession: 100,
  screenshotsPerEntry: 10,
  unattachedUploadHours: 24,
} as const;

const MIME_EXT: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};
const UPLOAD_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export interface FeedbackSessionRow {
  id: string;
  role: 'customer' | 'provider' | 'both';
  status: 'active' | 'completed' | 'dismissed';
  study_version: string;
}

function badRequest(message: string): never {
  throw createAppError(message, 400);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Trims, turns empty text into null and caps the length; anything else is refused.
const text = (max: number) => z.string().max(max * 4).transform(value => value.trim())
  .refine(value => value.length <= max, { message: `Please keep this under ${max} characters.` })
  .transform(value => (value.length ? value : null));

const sessionSchema = z.object({
  consent: z.literal(true, { error: 'Please agree to the privacy notice to start.' }),
  role: z.enum(['customer', 'provider', 'both']),
  deviceKind: z.enum(['phone', 'tablet', 'computer']).nullish(),
  appSurface: z.enum(['apk', 'browser', 'both']).nullish(),
  platformDetail: text(200).nullish(),
  appVersion: text(40).nullish(),
  helpMethods: z.array(z.enum(HELP_METHODS.map(m => m.key) as [string, ...string[]])).max(HELP_METHODS.length).default([]),
  testerName: text(200).nullish(),
  testerContact: text(200).nullish(),
}).strict();

export type NewSessionInput = z.input<typeof sessionSchema>;

export async function createSession(
  body: unknown, context: { ip: string | null; userAgent: string | null },
): Promise<{ sessionId: string; token: string; studyVersion: string }> {
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) badRequest(parsed.error.issues[0]?.message ?? 'Please check your answers.');
  const input = parsed.data;
  const token = crypto.randomBytes(32).toString('base64url');
  const row = (await db.query<{ id: string }>(
    `INSERT INTO feedback_sessions (study_version, token_hash, role, device_kind, app_surface, platform_detail,
       app_version, help_methods, tester_name, tester_contact, consent_at, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12) RETURNING id`,
    [STUDY_VERSION, hashToken(token), input.role, input.deviceKind ?? null, input.appSurface ?? null,
      input.platformDetail ?? null, input.appVersion ?? null, [...new Set(input.helpMethods)],
      input.testerName ?? null, input.testerContact ?? null, context.ip, context.userAgent?.slice(0, 500) ?? null],
  )).rows[0]!;
  return { sessionId: row.id, token, studyVersion: STUDY_VERSION };
}

export async function authenticateSession(sessionId: unknown, token: unknown): Promise<FeedbackSessionRow> {
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)
      || typeof token !== 'string' || token.length < 20 || token.length > 200) {
    throw createAppError('Your feedback session was not found. Please start again from the feedback page.', 401);
  }
  const row = (await db.query<FeedbackSessionRow & { token_hash: string }>(
    'SELECT id, role, status, study_version, token_hash FROM feedback_sessions WHERE id = $1', [sessionId],
  )).rows[0];
  const expected = Buffer.from(row?.token_hash ?? '0'.repeat(64), 'hex');
  const actual = Buffer.from(hashToken(token), 'hex');
  if (!row || !crypto.timingSafeEqual(expected, actual)) {
    throw createAppError('Your feedback session was not found. Please start again from the feedback page.', 401);
  }
  if (row.status === 'dismissed') throw createAppError('This feedback session is closed.', 403);
  return { id: row.id, role: row.role, status: row.status, study_version: row.study_version };
}

function answersSchema(questions: readonly StudyQuestion[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const question of questions) shape[question.key] = text(question.maxLength).nullish();
  return z.object(shape).strict().superRefine((value, ctx) => {
    for (const question of questions) {
      if (question.required && !value[question.key]) {
        ctx.addIssue({ code: 'custom', message: `Please answer: ${question.label}` });
      }
    }
  });
}

const screenshotsSchema = z.array(z.string().regex(UPLOAD_NAME_RE, 'A screenshot was not recognised. Please add it again.'))
  .max(FEEDBACK_LIMITS.screenshotsPerEntry, `Please attach at most ${FEEDBACK_LIMITS.screenshotsPerEntry} screenshots.`)
  .default([]);

const priceValue = z.number().int().min(0).max(1_000_000).nullish();
const pricesSchema = z.object(Object.fromEntries(PRICE_SERVICES.map(service => [service.key,
  z.object(Object.fromEntries(PRICE_POINTS.map(point => [point.key, priceValue]))).strict().nullish()])))
  .strict()
  .superRefine((value, ctx) => {
    for (const service of PRICE_SERVICES) {
      const points = value[service.key] as Record<string, number | null | undefined> | null | undefined;
      if (!points) continue;
      const filled = PRICE_POINTS.map(point => points[point.key]).filter((p): p is number => typeof p === 'number');
      for (let i = 1; i < filled.length; i += 1) {
        if (filled[i]! < filled[i - 1]!) {
          ctx.addIssue({ code: 'custom',
            message: `For "${service.name}", each price should be the same or higher than the one before it.` });
          return;
        }
      }
    }
  });

const entrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('first_impression'), answers: answersSchema(FIRST_IMPRESSION_QUESTIONS),
    screenshots: screenshotsSchema }).strict(),
  z.object({
    kind: z.literal('mission'),
    missionKey: z.string(),
    outcome: z.enum(['done', 'partly', 'no', 'gave_up'], { error: 'Please say whether you managed the mission.' }),
    seq: z.number({ error: 'Please choose a score from 1 to 7.' })
      .int().min(1, 'Please choose a score from 1 to 7.').max(7, 'Please choose a score from 1 to 7.'),
    answers: answersSchema(MISSION_QUESTIONS),
    screenshots: screenshotsSchema,
  }).strict(),
  z.object({
    kind: z.literal('problem'),
    severity: z.enum(SEVERITIES.map(s => s.key) as [string, ...string[]], { error: 'Please say how bad it was.' }),
    screenKey: z.string().regex(/^[a-z0-9_]{1,60}$/).nullish(),
    screenRoute: text(200).nullish(),
    appVersion: text(40).nullish(),
    answers: answersSchema(PROBLEM_QUESTIONS),
    screenshots: screenshotsSchema,
  }).strict(),
  z.object({
    kind: z.literal('wrapup'),
    sus: z.array(z.number().int().min(1).max(5)).length(SUS_ITEMS.length, 'Please answer all 10 statements.'),
    answers: z.record(z.string(), z.unknown()),
    prices: pricesSchema.nullish(),
    screenshots: screenshotsSchema,
  }).strict(),
]);

function wrapupQuestionsFor(role: FeedbackSessionRow['role']) {
  return WRAPUP_QUESTIONS.filter(q => !q.roles || role === 'both' || q.roles.includes(role));
}

export async function saveEntry(session: FeedbackSessionRow, body: unknown): Promise<{ entryId: string }> {
  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) badRequest(parsed.error.issues[0]?.message ?? 'Please check your answers.');
  const entry = parsed.data;

  let itemKey: string = entry.kind;
  let answers: Record<string, unknown> = entry.answers;
  let missionOutcome: string | null = null;
  let seq: number | null = null;
  let severity: string | null = null;
  let screenKey: string | null = null;
  let screenRoute: string | null = null;
  let appVersion: string | null = null;
  let sus: number[] | null = null;
  let prices: unknown = null;

  if (entry.kind === 'mission') {
    const mission = MISSIONS.find(m => m.key === entry.missionKey);
    if (!mission || (session.role !== 'both' && mission.role !== session.role)) badRequest('That mission is not part of your test.');
    itemKey = mission.key;
    missionOutcome = entry.outcome;
    seq = entry.seq;
  } else if (entry.kind === 'problem') {
    itemKey = 'problem';
    severity = entry.severity;
    if (entry.screenKey && !SCREENS.some(s => s.key === entry.screenKey)) badRequest('Please pick the screen from the list.');
    screenKey = entry.screenKey ?? null;
    screenRoute = entry.screenRoute ?? null;
    appVersion = entry.appVersion ?? null;
  } else if (entry.kind === 'wrapup') {
    const checked = answersSchema(wrapupQuestionsFor(session.role)).safeParse(entry.answers);
    if (!checked.success) badRequest(checked.error.issues[0]?.message ?? 'Please check your answers.');
    answers = checked.data;
    sus = entry.sus;
    prices = entry.prices ?? null;
  }
  // Drop empty answers so stored rows hold only what the tester wrote.
  answers = Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== null && value !== undefined));
  const screenshots = [...new Set(entry.screenshots)];

  return db.transaction(async client => {
    // Serialise saves within one session (the problem cap and upload claims).
    await client.query('SELECT id FROM feedback_sessions WHERE id = $1 FOR UPDATE', [session.id]);
    if (entry.kind === 'problem') {
      const count = Number((await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM feedback_entries WHERE session_id = $1 AND kind = 'problem'", [session.id],
      )).rows[0]!.n);
      if (count >= FEEDBACK_LIMITS.problemsPerSession) badRequest('This session has reached its limit of problem reports. Thank you!');
    }
    if (screenshots.length) {
      const owned = (await client.query<{ filename: string }>(
        'SELECT filename FROM feedback_uploads WHERE session_id = $1 AND filename = ANY($2::text[])',
        [session.id, screenshots],
      )).rows.length;
      if (owned !== screenshots.length) badRequest('A screenshot was not recognised. Please add it again.');
    }
    const values = [session.id, entry.kind, itemKey, missionOutcome, seq, severity, screenKey, screenRoute,
      JSON.stringify(answers), sus, sus ? susScore(sus) : null, prices === null ? null : JSON.stringify(prices), screenshots, appVersion];
    const saved = entry.kind === 'problem'
      ? await client.query<{ id: string }>(
        `INSERT INTO feedback_entries (session_id, kind, item_key, mission_outcome, seq, severity, screen_key,
           screen_route, answers, sus, sus_score, prices, screenshots, app_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14) RETURNING id`, values)
      : await client.query<{ id: string }>(
        `INSERT INTO feedback_entries (session_id, kind, item_key, mission_outcome, seq, severity, screen_key,
           screen_route, answers, sus, sus_score, prices, screenshots, app_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14)
         ON CONFLICT (session_id, kind, item_key) WHERE kind <> 'problem' DO UPDATE SET
           mission_outcome = EXCLUDED.mission_outcome, seq = EXCLUDED.seq, answers = EXCLUDED.answers,
           sus = EXCLUDED.sus, sus_score = EXCLUDED.sus_score, prices = EXCLUDED.prices,
           screenshots = EXCLUDED.screenshots, updated_at = NOW()
         RETURNING id`, values);
    const entryId = saved.rows[0]!.id;
    if (screenshots.length) {
      await client.query(
        'UPDATE feedback_uploads SET attached_at = COALESCE(attached_at, NOW()) WHERE session_id = $1 AND filename = ANY($2::text[])',
        [session.id, screenshots],
      );
    }
    await client.query(
      `UPDATE feedback_sessions SET updated_at = NOW(),
         completed_at = CASE WHEN $2 THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
         status = CASE WHEN $2 AND status = 'active' THEN 'completed' ELSE status END
       WHERE id = $1`,
      [session.id, entry.kind === 'wrapup'],
    );
    return { entryId };
  });
}

export async function sessionProgress(session: FeedbackSessionRow): Promise<{
  role: string; studyVersion: string; saved: Array<{ kind: string; itemKey: string; updatedAt: string }>; problems: number;
}> {
  const rows = (await db.query<{ kind: string; item_key: string; updated_at: Date }>(
    `SELECT kind, item_key, updated_at FROM feedback_entries WHERE session_id = $1 AND kind <> 'problem'
      ORDER BY created_at`, [session.id],
  )).rows;
  const problems = Number((await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM feedback_entries WHERE session_id = $1 AND kind = 'problem'", [session.id],
  )).rows[0]!.n);
  return {
    role: session.role,
    studyVersion: session.study_version,
    saved: rows.map(r => ({ kind: r.kind, itemKey: r.item_key, updatedAt: r.updated_at.toISOString() })),
    problems,
  };
}

// Screenshots live in uploads/feedback, which only the API's own user can
// open (0700), so the web server can never serve them directly (E52). The
// files themselves are written 0600.
export function feedbackUploadDir(): string {
  return path.join(getUploadDir(), 'feedback');
}

export async function ensurePrivateFeedbackDir(): Promise<void> {
  const dir = feedbackUploadDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);
}

export async function saveUpload(
  session: FeedbackSessionRow, file: { mimetype: string; buffer: Buffer },
): Promise<{ filename: string }> {
  const extension = MIME_EXT[file.mimetype];
  if (!extension) badRequest('Please add a JPG, PNG or WebP screenshot.');
  const cleaned = stripImageMetadata(file.buffer, file.mimetype);
  const filename = `${crypto.randomUUID()}.${extension}`;
  await ensurePrivateFeedbackDir();
  await db.transaction(async client => {
    await client.query('SELECT id FROM feedback_sessions WHERE id = $1 FOR UPDATE', [session.id]);
    const count = Number((await client.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM feedback_uploads WHERE session_id = $1', [session.id],
    )).rows[0]!.n);
    if (count >= FEEDBACK_LIMITS.uploadsPerSession) {
      badRequest(`This session has reached its limit of ${FEEDBACK_LIMITS.uploadsPerSession} screenshots.`);
    }
    await client.query('INSERT INTO feedback_uploads (filename, session_id, bytes) VALUES ($1,$2,$3)',
      [filename, session.id, cleaned.length]);
    // Written inside the transaction: if the file cannot be written, the row
    // is rolled back, so no entry can point at a missing file.
    await fs.writeFile(path.join(feedbackUploadDir(), filename), cleaned, { mode: 0o600, flag: 'wx' });
  });
  return { filename };
}

/** Deletes screenshots that were uploaded but never attached to an answer. */
export async function purgeUnattachedUploads(limit = 200): Promise<number> {
  const rows = (await db.query<{ filename: string }>(
    `SELECT filename FROM feedback_uploads WHERE attached_at IS NULL
       AND created_at < NOW() - make_interval(hours => $1) ORDER BY created_at LIMIT $2`,
    [FEEDBACK_LIMITS.unattachedUploadHours, limit],
  )).rows;
  let removed = 0;
  for (const { filename } of rows) {
    // Forget the file first, and only if it is still unattached, so a save
    // that attaches it at the same moment can never point at a deleted file.
    const forgotten = await db.query('DELETE FROM feedback_uploads WHERE filename = $1 AND attached_at IS NULL', [filename]);
    if (!forgotten.rowCount) continue;
    removed += 1;
    try {
      await fs.unlink(path.join(feedbackUploadDir(), filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('feedback upload cleanup could not delete a file', { filename });
      }
    }
  }
  return removed;
}
