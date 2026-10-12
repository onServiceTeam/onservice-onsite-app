// Tester feedback version 2 (Ken, 2026-10-12): the public study routes and the
// admin service against a real PostgreSQL schema built by migration 181.
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import type express from 'express';

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: () => (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('rate-limit-redis', () => ({ __esModule: true, default: class RedisStoreMock {} }));
jest.mock('../src/config/redis.config', () => ({ redis: { call: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({
  ...jest.requireActual('../src/services/upload.service'),
  // The allowed-types setting lives in the settings table; the real magic
  // byte check below still runs.
  validateFile: jest.fn().mockResolvedValue(undefined),
  getUploadDir: (): string => process.env.TEST_FEEDBACK_UPLOAD_DIR as string,
}));

import {
  withFeedbackDatabase, feedbackApp, feedbackIntegrationIt, pngWithMetadata, validWrapup, superAdminId,
} from './helpers/feedback-study-postgres';
import { purgeUnattachedUploads } from '../src/services/feedback-study.service';
import {
  feedbackOverview, listProblems, triageProblem, getSessionForAdmin, setSessionDismissed, problemHistory, eraseSession,
} from '../src/services/feedback-study-admin.service';

const POSIX = process.platform !== 'win32';

async function start(app: express.Express, role = 'customer'): Promise<{ id: string; token: string }> {
  const response = await request(app).post('/v2/sessions').send({
    consent: true, role, deviceKind: 'phone', appSurface: 'apk', helpMethods: ['facebook'],
    testerName: 'Synthetic Tester', testerContact: '09171234567',
  });
  expect(response.status).toBe(201);
  return { id: response.body.data.sessionId, token: response.body.data.token };
}

function save(app: express.Express, s: { id: string; token: string }, body: object) {
  return request(app).post(`/v2/sessions/${s.id}/entries`).set('x-feedback-session', s.token).send(body);
}

const mission = (seq: number, outcome = 'partly') => ({
  kind: 'mission', missionKey: 'c_aircon', outcome, seq,
  answers: { why: 'Could not find Saturday at first', expected: 'A calendar', change: 'Show dates first' },
});
const problem = (severity: string, happened: string) => ({
  kind: 'problem', severity, screenKey: 'other', screenRoute: '/customer/booking/new',
  answers: { trying: 'Pick a time', happened, expected: 'A time list' },
});

feedbackIntegrationIt('Feedback v2 - a tester saves each part as they go, and the wrap-up completes the session with its SUS score', async () => {
  await withFeedbackDatabase(async database => {
    const app = await feedbackApp();
    const s = await start(app);
    expect((await save(app, s, { kind: 'first_impression', answers: { what_for: 'Booking home repairs' } })).status).toBe(201);
    expect((await save(app, s, mission(3))).status).toBe(201);
    expect((await save(app, s, mission(5, 'done'))).status).toBe(201); // saved again: replaces
    expect((await save(app, s, problem('stopped', 'The page froze'))).status).toBe(201);
    expect((await save(app, s, problem('looks_wrong', 'Text cut off'))).status).toBe(201);
    expect((await save(app, s, validWrapup)).status).toBe(201);

    const progress = await request(app).get(`/v2/sessions/${s.id}/progress`).set('x-feedback-session', s.token);
    expect(progress.status).toBe(200);
    expect(progress.body.data.saved.map((e: { itemKey: string }) => e.itemKey)).toEqual(['first_impression', 'c_aircon', 'wrapup']);
    expect(progress.body.data.problems).toBe(2);

    const rows = (await database.query(`SELECT kind, item_key, mission_outcome, seq, sus_score::text, prices
      FROM feedback_entries ORDER BY created_at`)).rows;
    expect(rows.filter(r => r.kind === 'mission')).toEqual([
      expect.objectContaining({ item_key: 'c_aircon', mission_outcome: 'done', seq: 5 })]);
    expect(rows.find(r => r.kind === 'wrapup')).toEqual(expect.objectContaining({ sus_score: '100.00',
      prices: { aircon_clean: { too_cheap: 300, bargain: 600, expensive: 1200, too_expensive: 2000 } } }));
    const session = (await database.query('SELECT status, completed_at, token_hash, ip FROM feedback_sessions')).rows[0];
    expect(session.status).toBe('completed');
    expect(session.completed_at).not.toBeNull();
    expect(session.token_hash).not.toContain(s.token);
  });
});

feedbackIntegrationIt('Feedback v2 - a wrong or borrowed session token saves nothing', async () => {
  await withFeedbackDatabase(async database => {
    const app = await feedbackApp();
    const a = await start(app);
    const b = await start(app);
    expect((await save(app, { id: a.id, token: b.token }, mission(4))).status).toBe(401);
    expect((await save(app, { id: a.id, token: 'x'.repeat(43) }, mission(4))).status).toBe(401);
    expect((await request(app).post(`/v2/sessions/${a.id}/entries`).send(mission(4))).status).toBe(401);
    expect(Number((await database.query('SELECT count(*) FROM feedback_entries')).rows[0].count)).toBe(0);
  });
});

feedbackIntegrationIt('Feedback v2 - invalid answers are refused with a plain message and nothing is stored', async () => {
  await withFeedbackDatabase(async database => {
    const app = await feedbackApp();
    const customer = await start(app);
    const cases: Array<[object, RegExp]> = [
      [mission(8), /score from 1 to 7/],
      [{ ...mission(4), missionKey: 'p_hours' }, /not part of your test/],
      [{ ...mission(4), answers: { why: '   ' } }, /Please answer: Why did you give that score/],
      [{ ...validWrapup, prices: { aircon_clean: { too_cheap: 900, bargain: 500 } } }, /same or higher/],
      [{ ...validWrapup, sus: [5, 5, 5] }, /all 10 statements/],
      [{ ...problem('stopped', 'x'), severity: 'meh' }, /how bad it was/],
      [{ ...problem('stopped', 'x'), screenKey: 'not_a_screen' }, /pick the screen/],
    ];
    for (const [body, message] of cases) {
      const response = await save(app, customer, body);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(message);
    }
    expect(Number((await database.query('SELECT count(*) FROM feedback_entries')).rows[0].count)).toBe(0);
    const noConsent = await request(app).post('/v2/sessions').send({ role: 'customer' });
    expect(noConsent.status).toBe(400);
    expect(Number((await database.query('SELECT count(*) FROM feedback_sessions')).rows[0].count)).toBe(1);
  });
});

feedbackIntegrationIt('Feedback v2 - a bot that fills the hidden field is told "saved" but nothing is stored', async () => {
  await withFeedbackDatabase(async database => {
    const app = await feedbackApp();
    const response = await request(app).post('/v2/sessions').send({ consent: true, role: 'customer', website: 'spam.example' });
    expect(response.status).toBe(201);
    expect(response.body.data.sessionId).toBeNull();
    expect(Number((await database.query('SELECT count(*) FROM feedback_sessions')).rows[0].count)).toBe(0);
  });
});

feedbackIntegrationIt('E52 - screenshots are stored without hidden metadata, privately, and only their own session can attach them', async () => {
  await withFeedbackDatabase(async (database, uploadRoot) => {
    const app = await feedbackApp();
    const a = await start(app);
    const b = await start(app);
    const upload = await request(app).post(`/v2/sessions/${a.id}/uploads`).set('x-feedback-session', a.token)
      .attach('file', pngWithMetadata(), { filename: 'shot.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    const { filename } = upload.body.data;
    expect(filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    const stored = fs.readFileSync(path.join(uploadRoot, 'feedback', filename));
    expect(stored.includes(Buffer.from('GPS'))).toBe(false);
    expect(stored.includes(Buffer.from('taken at home'))).toBe(false);
    expect(stored.includes(Buffer.from('picture-data'))).toBe(true);
    if (POSIX) {
      // Only the API's own user can open the folder and the file (the web
      // server runs as another user). Windows has no such permission bits.
      expect(fs.statSync(path.join(uploadRoot, 'feedback')).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(uploadRoot, 'feedback', filename)).mode & 0o777).toBe(0o600);
    }
    const borrowed = await save(app, b, { ...problem('stopped', 'Froze'), screenshots: [filename] });
    expect(borrowed.status).toBe(400);
    const own = await save(app, a, { ...problem('stopped', 'Froze'), screenshots: [filename] });
    expect(own.status).toBe(201);
    const row = (await database.query('SELECT attached_at FROM feedback_uploads WHERE filename = $1', [filename])).rows[0];
    expect(row.attached_at).not.toBeNull();
    const notImage = await request(app).post(`/v2/sessions/${a.id}/uploads`).set('x-feedback-session', a.token)
      .attach('file', Buffer.from('not an image at all'), { filename: 'x.png', contentType: 'image/png' });
    expect(notImage.status).toBe(400);
  });
});

feedbackIntegrationIt('Feedback v2 - clean-up deletes only screenshots that were never attached and are over a day old', async () => {
  await withFeedbackDatabase(async (database, uploadRoot) => {
    const app = await feedbackApp();
    const s = await start(app);
    const names: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await request(app).post(`/v2/sessions/${s.id}/uploads`).set('x-feedback-session', s.token)
        .attach('file', pngWithMetadata(), { filename: 'shot.png', contentType: 'image/png' });
      names.push(response.body.data.filename);
    }
    const [attached, oldLoose, freshLoose] = names as [string, string, string];
    expect((await save(app, s, { ...problem('slowed', 'Slow'), screenshots: [attached] })).status).toBe(201);
    await database.query(`UPDATE feedback_uploads SET created_at = NOW() - INTERVAL '25 hours' WHERE filename = ANY($1)`,
      [[attached, oldLoose]]);

    expect(await purgeUnattachedUploads()).toBe(1);
    const left = (await database.query('SELECT filename FROM feedback_uploads ORDER BY filename')).rows.map(r => r.filename);
    expect(left.sort()).toEqual([attached, freshLoose].sort());
    expect(fs.existsSync(path.join(uploadRoot, 'feedback', oldLoose))).toBe(false);
    expect(fs.existsSync(path.join(uploadRoot, 'feedback', attached))).toBe(true);
  });
});

feedbackIntegrationIt('Feedback v2 - the admin overview counts completion, ease, SUS and testers per screen, without dismissed sessions', async () => {
  await withFeedbackDatabase(async () => {
    const app = await feedbackApp();
    const one = await start(app);
    const two = await start(app);
    const junk = await start(app);
    await save(app, one, mission(6, 'done'));
    await save(app, two, mission(2, 'gave_up'));
    await save(app, junk, mission(7, 'done'));
    await save(app, one, problem('stopped', 'Froze'));
    await save(app, one, problem('annoyed', 'Too many steps'));
    await save(app, two, problem('stopped', 'Froze too'));
    await save(app, one, validWrapup);
    await save(app, two, { ...validWrapup, sus: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] });
    await setSessionDismissed({ sessionId: junk.id, adminId: superAdminId, dismissed: true, note: 'Stress test by Ken' });

    const overview = await feedbackOverview();
    expect(overview.sessions.total).toBe(2);
    expect(overview.missions.find(m => m.key === 'c_aircon')).toEqual(expect.objectContaining({
      answered: 2, done: 1, gaveUp: 1, completionRate: 50, averageEase: 4,
    }));
    expect(overview.sus).toEqual({ responses: 2, average: 75, lowest: 50, highest: 100 });
    expect(overview.problemsByScreen).toEqual([expect.objectContaining({
      screenKey: 'other', reports: 3, testers: 2, bySeverity: { stopped: 2, annoyed: 1 },
    })]);
  });
});

feedbackIntegrationIt('Feedback v2 - triage records owner, duplicates and history, and ordinary admins see masked contact details', async () => {
  await withFeedbackDatabase(async database => {
    const app = await feedbackApp();
    const s = await start(app);
    await save(app, s, problem('stopped', 'Froze. Call me on 09171234567'));
    await save(app, s, problem('stopped', 'Same freeze'));
    const [first, second] = (await database.query(
      "SELECT id, updated_at FROM feedback_entries WHERE kind = 'problem' ORDER BY created_at")).rows;

    await expect(triageProblem({ entryId: second.id, adminId: superAdminId, actorRole: 'super_admin', status: 'duplicate',
      assignedAdminId: null, duplicateOf: null, note: 'Same as the first report', expectedUpdatedAt: second.updated_at.toISOString(),
    })).rejects.toMatchObject({ statusCode: 400 });
    const marked = await triageProblem({ entryId: second.id, adminId: superAdminId, actorRole: 'super_admin', status: 'duplicate',
      assignedAdminId: null, duplicateOf: first.id, note: 'Same as the first report', expectedUpdatedAt: second.updated_at.toISOString() });
    expect(marked.duplicateOf).toBe(first.id);
    await expect(triageProblem({ entryId: second.id, adminId: superAdminId, actorRole: 'super_admin', status: 'new',
      assignedAdminId: null, duplicateOf: null, note: 'Undo the duplicate mark', expectedUpdatedAt: second.updated_at.toISOString(),
    })).rejects.toMatchObject({ statusCode: 409 });
    const audit = (await database.query("SELECT action, entity_id, new_values FROM audit_log")).rows;
    expect(audit).toEqual([expect.objectContaining({ action: 'feedback_problem_updated', entity_id: second.id,
      new_values: expect.objectContaining({ status: 'duplicate', duplicateOf: first.id }) })]);

    const asAdmin = await listProblems({ role: 'admin', page: 1, pageSize: 25 });
    expect(JSON.stringify(asAdmin)).not.toContain('09171234567');
    const session = await getSessionForAdmin(s.id, 'admin');
    expect(session.session.testerName).toBeNull();
    expect(session.session.testerContact).toBeNull();
    expect(session.session.hasContact).toBe(true);
    const asSuper = await getSessionForAdmin(s.id, 'super_admin');
    expect(asSuper.session.testerName).toBe('Synthetic Tester');
  });
});

feedbackIntegrationIt('Feedback v2 - each problem keeps the app version it was reported from, and its triage history is readable', async () => {
  await withFeedbackDatabase(async database => {
    const app = await feedbackApp();
    const s = await start(app);
    expect((await save(app, s, { ...problem('slowed', 'Slow list'), appVersion: '1.0.2' })).status).toBe(201);
    const row = (await database.query("SELECT id, updated_at, app_version FROM feedback_entries WHERE kind = 'problem'")).rows[0];
    expect(row.app_version).toBe('1.0.2');
    await triageProblem({ entryId: row.id, adminId: superAdminId, actorRole: 'super_admin', status: 'triaged',
      assignedAdminId: superAdminId, duplicateOf: null, note: 'Seen it, call 09171234567', expectedUpdatedAt: row.updated_at.toISOString() });
    const forAdmin = await problemHistory(row.id, 'admin');
    expect(forAdmin).toEqual([expect.objectContaining({ adminId: superAdminId,
      from: expect.objectContaining({ status: 'new' }), to: expect.objectContaining({ status: 'triaged' }) })]);
    expect(JSON.stringify(forAdmin)).not.toContain('09171234567');
    expect(JSON.stringify(await problemHistory(row.id, 'super_admin'))).toContain('09171234567');
  });
});

feedbackIntegrationIt('Feedback v2 - erasing a tester removes their answers and screenshot files and reopens reports marked as their duplicates', async () => {
  await withFeedbackDatabase(async (database, uploadRoot) => {
    const app = await feedbackApp();
    const leaving = await start(app);
    const staying = await start(app);
    const upload = await request(app).post(`/v2/sessions/${leaving.id}/uploads`).set('x-feedback-session', leaving.token)
      .attach('file', pngWithMetadata(), { filename: 'shot.png', contentType: 'image/png' });
    const { filename } = upload.body.data;
    await save(app, leaving, { ...problem('stopped', 'Froze'), screenshots: [filename] });
    await save(app, leaving, mission(3));
    await save(app, staying, problem('stopped', 'Froze for me too'));
    const original = (await database.query('SELECT id FROM feedback_entries WHERE session_id = $1 AND kind = $2', [leaving.id, 'problem'])).rows[0];
    const copy = (await database.query('SELECT id, updated_at FROM feedback_entries WHERE session_id = $1', [staying.id])).rows[0];
    await triageProblem({ entryId: copy.id, adminId: superAdminId, actorRole: 'super_admin', status: 'duplicate',
      assignedAdminId: null, duplicateOf: original.id, note: 'Same freeze report', expectedUpdatedAt: copy.updated_at.toISOString() });

    expect(await eraseSession({ sessionId: leaving.id, adminId: superAdminId, note: 'Tester asked to be deleted' }))
      .toEqual({ entries: 2, screenshots: 1 });
    expect(Number((await database.query('SELECT count(*) FROM feedback_sessions WHERE id = $1', [leaving.id])).rows[0].count)).toBe(0);
    expect(Number((await database.query('SELECT count(*) FROM feedback_entries WHERE session_id = $1', [leaving.id])).rows[0].count)).toBe(0);
    expect(Number((await database.query('SELECT count(*) FROM feedback_uploads')).rows[0].count)).toBe(0);
    expect(fs.existsSync(path.join(uploadRoot, 'feedback', filename))).toBe(false);
    const reopened = (await database.query('SELECT status, duplicate_of FROM feedback_entries WHERE id = $1', [copy.id])).rows[0];
    expect(reopened).toEqual({ status: 'new', duplicate_of: null });
    const audit = (await database.query("SELECT old_values, new_values FROM audit_log WHERE action = 'feedback_session_erased'")).rows[0];
    expect(audit.old_values).toEqual({ entries: 2, screenshots: 1 });
    expect(JSON.stringify(audit)).not.toContain('Froze');
  });
});
