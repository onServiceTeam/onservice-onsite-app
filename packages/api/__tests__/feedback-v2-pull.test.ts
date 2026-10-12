// Runs the real scripts/feedback/pull.mjs against a local HTTP server that
// answers like the live API, then reads the files it wrote.
// Plan: docs/qa/ux-testing/FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md (defects 8, 9, 10).

import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicStudy, susScore, STUDY_VERSION } from '../src/config/feedback-study';

// Wording comes from the live study definition, which other work may reword.
const STUDY = publicStudy();
const nameOf = <T extends { key: string }>(list: readonly T[], key: string): T => {
  const found = list.find(item => item.key === key);
  if (!found) throw new Error(`Study has no ${key}`);
  return found;
};
const OTHER_SCREEN = nameOf(STUDY.screens, 'other').name;
const AIRCON_MISSION = nameOf(STUDY.missions, 'c_aircon').title;
const HOURS_MISSION = nameOf(STUDY.missions, 'p_hours').title;
const STOPPED = nameOf(STUDY.severities, 'stopped').label;
const SLOWED = nameOf(STUDY.severities, 'slowed').label;
const AIRCON_PRICE = nameOf(STUDY.prices.services, 'aircon_clean').name;

const EXPORT_KEY = 'private-feedback-v2-pull-key-0123456789abcdef';
const SCRIPT = path.resolve(__dirname, '../../..', 'scripts', 'feedback', 'pull.mjs');

const SHOT_MISSION = '11111111-1111-4111-8111-111111111111.png';
const SHOT_PROBLEM = '22222222-2222-4222-8222-222222222222.jpg';
const SHOT_MISSING = '33333333-3333-4333-8333-333333333333.png';
const SHOT_DISMISSED = '44444444-4444-4444-8444-444444444444.png';
const SPREADSHEETS = ['missions.csv', 'problems.csv', 'first-impressions.csv', 'wrapup.csv', 'sessions.csv'];

const S1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const S2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const S3 = 'cccccccc-0000-4000-8000-000000000003';

const SUS_ALL_BEST = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
const SUS_ALL_MIDDLE = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];

function session(id: string, role: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id, label: `Tester ${id.slice(0, 6)}`, createdAt: '2026-10-12T01:00:00.000Z', updatedAt: '2026-10-12T02:00:00.000Z',
    studyVersion: STUDY_VERSION, role, deviceKind: 'phone', appSurface: 'apk', platformDetail: 'Android 14', appVersion: '1.0.1',
    helpMethods: ['facebook'], testerName: null, testerContact: null, hasContact: false,
    completedAt: status === 'completed' ? '2026-10-12T02:00:00.000Z' : null, status, ...extra,
  };
}

function entry(id: string, sessionId: string, kind: string, extra: Record<string, unknown>) {
  return {
    id, sessionId, kind, itemKey: kind, createdAt: '2026-10-12T01:30:00.000Z', updatedAt: '2026-10-12T01:30:00.000Z',
    missionOutcome: null, seq: null, severity: null, screenKey: null, screenName: null, screenRoute: null,
    answers: {}, sus: null, susScore: null, prices: null, screenshots: [], status: 'new', duplicateOf: null,
    assignedAdminId: null, triageNote: null, ...extra,
  };
}

function exportData(extraShots: string[] = []) {
  return {
    exportedAt: '2026-10-12T03:00:00.000Z',
    study: STUDY,
    overview: {},
    sessions: [
      session(S1, 'customer', 'completed', { testerName: 'Ana Test', testerContact: 'ana@example.com', hasContact: true }),
      session(S2, 'provider', 'active'),
      session(S3, 'customer', 'dismissed'),
    ],
    entries: [
      entry('e0000001-0000-4000-8000-000000000001', S1, 'first_impression', {
        answers: { what_for: 'Booking cleaners, I think', who_for: 'Busy families' },
      }),
      entry('e0000002-0000-4000-8000-000000000002', S1, 'mission', {
        itemKey: 'c_aircon', missionOutcome: 'done', seq: 6,
        answers: { why: '=HYPERLINK("http://evil.example","click")', expected: 'It said "Saturday", then nothing', change: 'first line\nsecond line' },
        screenshots: [SHOT_MISSION, ...extraShots],
      }),
      entry('e0000003-0000-4000-8000-000000000003', S2, 'mission', {
        itemKey: 'p_hours', missionOutcome: 'gave_up', seq: 2,
        answers: { why: '-the save button was hidden', change: '+63 add a clear Save' },
      }),
      entry('e0000004-0000-4000-8000-000000000004', S3, 'mission', {
        itemKey: 'c_aircon', missionOutcome: 'no', seq: 1, answers: { why: 'junk session that an admin dismissed' },
        screenshots: [SHOT_DISMISSED],
      }),
      entry('e0000005-0000-4000-8000-000000000005', S1, 'problem', {
        itemKey: 'problem', severity: 'stopped', screenKey: 'other', screenName: OTHER_SCREEN,
        answers: { trying: '@book an aircon cleaning', happened: 'The spinner never stopped' },
        screenshots: [SHOT_PROBLEM],
      }),
      entry('e0000006-0000-4000-8000-000000000006', S2, 'problem', {
        itemKey: 'problem', severity: 'slowed', screenKey: 'other', screenName: OTHER_SCREEN, appVersion: '1.0.2',
        answers: { trying: 'Set my hours', happened: 'Took four tries' },
      }),
      entry('e0000007-0000-4000-8000-000000000007', S1, 'problem', {
        itemKey: 'problem', severity: 'stopped', screenKey: 'other', status: 'duplicate',
        duplicateOf: 'e0000005-0000-4000-8000-000000000005',
        answers: { trying: 'Book again', happened: 'Same spinner' },
      }),
      entry('e0000008-0000-4000-8000-000000000008', S1, 'wrapup', {
        itemKey: 'wrapup', sus: SUS_ALL_BEST, susScore: susScore(SUS_ALL_BEST),
        answers: { change_1: 'Bigger buttons', change_2: 'Show prices sooner', change_3: 'Fewer steps', would_use: 'Maybe' },
        prices: { aircon_clean: { too_cheap: 300, bargain: 500, expensive: 900, too_expensive: 1500 } },
      }),
      entry('e0000009-0000-4000-8000-000000000009', S2, 'wrapup', {
        itemKey: 'wrapup', sus: SUS_ALL_MIDDLE, susScore: susScore(SUS_ALL_MIDDLE),
        answers: { change_1: 'a', change_2: 'b', change_3: 'c', would_rely: 'Not yet' },
        // A worker's guess at what customers would pay: kept apart from customer answers.
        prices: { aircon_clean: { too_cheap: 100, bargain: 200, expensive: 300, too_expensive: 400 } },
      }),
    ],
  };
}

interface Observed { method: string; url: string; key: string | undefined }

type Handler = (req: IncomingMessage, res: ServerResponse) => boolean;

async function withServer(handler: Handler, run: (api: string, observed: Observed[]) => Promise<void>) {
  const observed: Observed[] = [];
  const server = createServer((req, res) => {
    observed.push({ method: req.method ?? '', url: req.url ?? '', key: req.headers['x-feedback-key'] as string | undefined });
    if (req.headers['x-feedback-key'] !== EXPORT_KEY) {
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"success":false}');
      return;
    }
    if (!handler(req, res)) res.writeHead(404, { 'content-type': 'application/json' }).end('{"success":false}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
    await run(`http://127.0.0.1:${address.port}`, observed);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function v2Handler(data: unknown, shots: Record<string, string>): Handler {
  return (req, res) => {
    if (req.url === '/api/v1/feedback/v2/export.json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ success: true, data }));
      return true;
    }
    const match = /^\/api\/v1\/feedback\/export-screenshot\/(.+)$/.exec(req.url ?? '');
    if (match && shots[decodeURIComponent(match[1]!)] !== undefined) {
      res.writeHead(200, { 'content-type': 'image/png' }).end(shots[decodeURIComponent(match[1]!)]);
      return true;
    }
    return false;
  };
}

function runPull(api: string, outDir: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, '--api', api, '--out-dir', outDir], {
      env: { ...process.env, FEEDBACK_EXPORT_KEY: EXPORT_KEY },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

// Minimal RFC 4180 reader, so the assertions check cell values, not raw text.
function parseCsv(text: string): string[][] {
  const body = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && body[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function readCsv(file: string): Array<Record<string, string>> {
  const [headers, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  return rows.map(r => Object.fromEntries(headers!.map((h, i) => [h, r[i] ?? ''])));
}

function column(rows: Array<Record<string, string>>, prefix: string): string {
  const header = Object.keys(rows[0] ?? {}).find(h => h === prefix || h.startsWith(`${prefix}: `) || h.startsWith(`${prefix} `));
  if (!header) throw new Error(`No column starting with ${prefix}`);
  return header;
}

let outDir: string;
beforeEach(() => { outDir = mkdtempSync(path.join(tmpdir(), 'onservice-feedback-v2-pull-')); });
afterEach(() => { rmSync(outDir, { recursive: true, force: true }); });

it('Feedback v2 defect 9: the pull writes the whole bundle (summary, five spreadsheets, raw export, screenshots) from one export', async () => {
  const data = exportData();
  await withServer(v2Handler(data, { [SHOT_MISSION]: 'mission png bytes', [SHOT_PROBLEM]: 'problem jpg bytes' }), async (api, observed) => {
    const result = await runPull(api, outDir);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(observed.filter(r => r.url === '/api/v1/feedback/v2/export.json')).toHaveLength(1);
    // The dismissed (junk) session's screenshot is never requested.
    expect(observed.some(r => r.url.includes(SHOT_DISMISSED))).toBe(false);
  });

  const bundle = path.join(outDir, 'feedback-v2');
  expect(readFileSync(path.join(bundle, '.gitignore'), 'utf8')).toMatch(/^\*$/m);
  expect(JSON.parse(readFileSync(path.join(bundle, 'raw.json'), 'utf8'))).toEqual(data);
  expect(readFileSync(path.join(bundle, 'screenshots', SHOT_MISSION), 'utf8')).toBe('mission png bytes');
  expect(readFileSync(path.join(bundle, 'screenshots', SHOT_PROBLEM), 'utf8')).toBe('problem jpg bytes');
  expect(readdirSync(path.join(bundle, 'screenshots')).sort()).toEqual([SHOT_MISSION, SHOT_PROBLEM].sort());
  // The bundle was built beside the old one and swapped in: nothing is left over.
  expect(readdirSync(outDir).filter(name => name.startsWith('feedback-v2'))).toEqual(['feedback-v2']);
  // Every spreadsheet starts with the UTF-8 byte order mark, so Excel shows ₱ and Bisaya text correctly.
  for (const file of SPREADSHEETS) {
    expect(readFileSync(path.join(bundle, file), 'utf8').startsWith('\uFEFF')).toBe(true);
  }

  const summary = readFileSync(path.join(bundle, 'SUMMARY.md'), 'utf8');
  expect(summary).toContain('# Tester feedback summary (version 2), 2026-10-12');
  expect(summary).toContain(`- Study version: ${STUDY_VERSION}
`);
  expect(summary).toContain('- Testers: 2 (customer 1, provider 1, both 0)');
  expect(summary).toContain('- Completed the wrap-up: 1 of 2');
  expect(summary).toContain('- App versions seen: 1.0.1, 1.0.2');
  expect(summary).toContain('- Left out: 1 session(s) an admin dismissed');
  // The dismissed session's "no" answer is not counted.
  expect(summary).toContain(`| ${AIRCON_MISSION} | customer | 1 | 100% | 0 | 0 | 0 | 6 (n=1) |`);
  expect(summary).toContain(`| ${HOURS_MISSION} | provider | 1 | 0% | 0 | 0 | 1 | 2 (n=1) |`);
  expect(summary).toContain('- Average: **75** out of 100 (n=2; lowest 50, highest 100)');
  // Two different testers; the duplicate report is left out of the screen table.
  expect(summary).toContain(`| ${OTHER_SCREEN} | 2 | 2 | 1 | 1 | 0 | 0 |`);
  // Prices: one row per side. Customer and worker answers are never mixed into one median.
  expect(summary).toContain(`| ${AIRCON_PRICE} | customer | 300 (n=1) | 500 (n=1) | 900 (n=1) | 1500 (n=1) |`);
  expect(summary).toContain(`| ${AIRCON_PRICE} | provider | 100 (n=1) | 200 (n=1) | 300 (n=1) | 400 (n=1) |`);
  expect(summary).not.toContain('(n=2) |');
  expect(summary).toContain(`| ${nameOf(STUDY.prices.services, 'home_clean').name} | no answers | n/a | n/a | n/a | n/a |`);
  expect(summary).toContain('## How to read this');
  expect(summary).toContain('- Downloaded: 2 of 2');
  expect(summary).not.toContain('—');

  const missions = readCsv(path.join(bundle, 'missions.csv'));
  expect(missions.map(r => r.mission_key)).toEqual(['c_aircon', 'p_hours']);
  expect(missions[0]!.outcome_label).toBe(nameOf(STUDY.missionOutcomes, 'done').label);
  expect(missions[0]!.ease_1_to_7).toBe('6');
  expect(missions[0]![column(missions, 'expected')]).toBe('It said "Saturday", then nothing');
  expect(missions[0]![column(missions, 'change')]).toBe('first line\nsecond line');
  expect(missions[0]!.screenshots).toBe(`screenshots/${SHOT_MISSION}`);

  const problems = readCsv(path.join(bundle, 'problems.csv'));
  expect(problems).toHaveLength(3);
  expect(problems.map(r => r.severity_label)).toEqual([STOPPED, SLOWED, STOPPED]);
  expect(problems[2]!.triage_status).toBe('duplicate');
  expect(problems[2]!.duplicate_of).toBe('e0000005-0000-4000-8000-000000000005');
  expect(problems[0]![column(problems, 'happened')]).toBe('The spinner never stopped');
  // The app version saved with the report wins over the one given at the start of the session.
  expect(problems.map(r => r.app_version)).toEqual(['1.0.1', '1.0.2', '1.0.1']);

  const first = readCsv(path.join(bundle, 'first-impressions.csv'));
  expect(first).toHaveLength(1);
  expect(first[0]![column(first, 'what_for')]).toBe('Booking cleaners, I think');

  const wrapup = readCsv(path.join(bundle, 'wrapup.csv'));
  expect(wrapup).toHaveLength(2);
  const susHeaders = Object.keys(wrapup[0]!).filter(h => /^sus_\d+: /.test(h));
  expect(susHeaders).toHaveLength(10);
  expect(susHeaders[0]).toBe(`sus_1: ${STUDY.sus.items[0]}`);
  expect(susHeaders.map(h => wrapup[0]![h])).toEqual(SUS_ALL_BEST.map(String));
  expect(wrapup.map(r => r.sus_score_0_to_100)).toEqual(['100', '50']);
  expect(wrapup[0]![column(wrapup, 'price_aircon_clean_too_expensive')]).toBe('1500');
  expect(wrapup[0]![column(wrapup, 'price_home_clean_bargain')]).toBe('');
  expect(wrapup[1]![column(wrapup, 'would_rely')]).toBe('Not yet');

  const sessions = readCsv(path.join(bundle, 'sessions.csv'));
  expect(sessions.map(r => r.status)).toEqual(['completed', 'active', 'dismissed']);
  expect(sessions[0]!.tester_contact).toBe('ana@example.com');
  expect(sessions[0]!.gets_help_today).toBe(nameOf(STUDY.helpMethods, 'facebook').label);
  expect(sessions[0]!.missions_saved).toBe('1');
  expect(sessions[0]!.problems_reported).toBe('2');
  expect(Object.keys(sessions[0]!).some(h => /\bip\b/i.test(h))).toBe(false);
});

it('Feedback v2 defect 9: every spreadsheet cell that starts with = + - or @ is written as text', async () => {
  await withServer(v2Handler(exportData(), { [SHOT_MISSION]: 'a', [SHOT_PROBLEM]: 'b' }), async (api) => {
    expect((await runPull(api, outDir)).code).toBe(0);
  });
  const bundle = path.join(outDir, 'feedback-v2');
  const missions = readCsv(path.join(bundle, 'missions.csv'));
  const why = column(missions, 'why');
  const change = column(missions, 'change');
  expect(missions[0]![why]).toBe(`'=HYPERLINK("http://evil.example","click")`);
  expect(missions[1]![why]).toBe("'-the save button was hidden");
  expect(missions[1]![change]).toBe("'+63 add a clear Save");
  const problems = readCsv(path.join(bundle, 'problems.csv'));
  expect(problems[0]![column(problems, 'trying')]).toBe("'@book an aircon cleaning");
  // A plain answer is left exactly as typed.
  expect(problems[1]![column(problems, 'trying')]).toBe('Set my hours');
  // No raw formula cell anywhere in any spreadsheet.
  for (const file of ['missions.csv', 'problems.csv', 'first-impressions.csv', 'wrapup.csv', 'sessions.csv']) {
    for (const row of parseCsv(readFileSync(path.join(bundle, file), 'utf8'))) {
      for (const cell of row) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
    }
  }
});

it('Feedback v2 defect 8: a screenshot that fails to download is reported, the rest is written, and the exit code is not zero', async () => {
  await withServer(v2Handler(exportData([SHOT_MISSING]), { [SHOT_MISSION]: 'a', [SHOT_PROBLEM]: 'b' }), async (api) => {
    const result = await runPull(api, outDir);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('1 screenshot(s) could not be downloaded');
    expect(result.stderr).toContain(SHOT_MISSING);
    expect(result.stderr).toContain('404');
  });
  const bundle = path.join(outDir, 'feedback-v2');
  expect(existsSync(path.join(bundle, 'screenshots', SHOT_MISSING))).toBe(false);
  expect(readFileSync(path.join(bundle, 'screenshots', SHOT_MISSION), 'utf8')).toBe('a');
  const summary = readFileSync(path.join(bundle, 'SUMMARY.md'), 'utf8');
  expect(summary).toContain('- Downloaded: 2 of 3');
  expect(summary).toContain(`**Could not download 1:**`);
  expect(summary).toContain(SHOT_MISSING);
  expect(readCsv(path.join(bundle, 'missions.csv'))).toHaveLength(2);
});

it('Feedback v2 defect 8: with --out-dir the pull prints the folders it really wrote to', async () => {
  await withServer(v2Handler(exportData(), { [SHOT_MISSION]: 'a', [SHOT_PROBLEM]: 'b' }), async (api) => {
    const result = await runPull(api, outDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Wrote: ${path.join(outDir, 'feedback-v2')}`);
    expect(result.stdout).toContain(path.join(outDir, 'feedback-v2', 'SUMMARY.md'));
    expect(result.stdout).not.toContain('docs/qa/ux-testing');
  });
});

it('Feedback v2 pull: the export key goes only in the header and is never sent on through a redirect', async () => {
  const redirected: string[] = [];
  const handler: Handler = (req, res) => {
    if (req.url === '/api/v1/feedback/v2/export.json') {
      res.writeHead(302, { location: '/elsewhere/export.json' }).end();
      return true;
    }
    if ((req.url ?? '').startsWith('/elsewhere/')) {
      redirected.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"success":true,"data":{}}');
      return true;
    }
    return false;
  };
  await withServer(handler, async (api, observed) => {
    const result = await runPull(api, outDir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Pull failed');
    expect(redirected).toEqual([]);
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every(r => r.key === EXPORT_KEY)).toBe(true);
    expect(observed.every(r => !r.url.toLowerCase().includes('key'))).toBe(true);
  });
  expect(existsSync(path.join(outDir, 'feedback-v2'))).toBe(false);
  expect(existsSync(path.join(outDir, 'feedback-v2.partial'))).toBe(false);
});

it('Feedback v2 pull: version 2 is pulled first, and a version 1 failure is reported without stopping it', async () => {
  const handler = v2Handler(exportData(), { [SHOT_MISSION]: 'a', [SHOT_PROBLEM]: 'b' });
  const withBrokenV1: Handler = (req, res) => {
    if ((req.url ?? '').startsWith('/api/v1/feedback/export.')) {
      res.writeHead(500, { 'content-type': 'application/json' }).end('{"success":false,"error":"database down"}');
      return true;
    }
    return handler(req, res);
  };
  await withServer(withBrokenV1, async (api, observed) => {
    const result = await runPull(api, outDir);
    expect(observed[0]!.url).toBe('/api/v1/feedback/v2/export.json');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Version 1 inbox failed');
    expect(result.stderr).toContain('500');
    expect(result.stderr).toContain('Pull failed: Version 1 inbox (see above). The version 2 bundle was still written in full.');
    expect(result.stdout).toContain('Version 2 bundle: 2 tester(s)');
  });
  const bundle = path.join(outDir, 'feedback-v2');
  expect(readFileSync(path.join(bundle, 'SUMMARY.md'), 'utf8')).toContain('- Downloaded: 2 of 2');
  expect(readCsv(path.join(bundle, 'missions.csv'))).toHaveLength(2);
  expect(readFileSync(path.join(bundle, 'screenshots', SHOT_MISSION), 'utf8')).toBe('a');
  // Nothing of version 1 was written.
  expect(existsSync(path.join(outDir, 'FEEDBACK-INBOX.json'))).toBe(false);
});

it('Feedback v2 pull: a pull that fails part-way leaves the previous bundle exactly as it was', async () => {
  const bundle = path.join(outDir, 'feedback-v2');
  await withServer(v2Handler(exportData(), { [SHOT_MISSION]: 'old a', [SHOT_PROBLEM]: 'old b' }), async (api) => {
    expect((await runPull(api, outDir)).code).toBe(0);
  });
  const before = Object.fromEntries(['SUMMARY.md', ...SPREADSHEETS, 'raw.json', '.gitignore']
    .map(file => [file, readFileSync(path.join(bundle, file), 'utf8')]));

  // The export passes the shape check, the screenshots download, then building
  // the spreadsheets fails on a broken session row.
  const broken = exportData() as { sessions: unknown[] };
  broken.sessions.push(null);
  await withServer(v2Handler(broken, { [SHOT_MISSION]: 'new a', [SHOT_PROBLEM]: 'new b' }), async (api, observed) => {
    const result = await runPull(api, outDir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Version 2 bundle failed');
    expect(observed.some(r => r.url.includes(SHOT_MISSION))).toBe(true);
  });
  for (const [file, content] of Object.entries(before)) {
    expect(readFileSync(path.join(bundle, file), 'utf8')).toBe(content);
  }
  expect(readFileSync(path.join(bundle, 'screenshots', SHOT_MISSION), 'utf8')).toBe('old a');
  expect(readdirSync(outDir).filter(name => name.startsWith('feedback-v2'))).toEqual(['feedback-v2']);

  // The next good pull replaces the bundle in full: a screenshot no longer on the server does not linger.
  const fewer = exportData();
  for (const e of fewer.entries) if (e.id.startsWith('e0000002')) e.screenshots = [];
  await withServer(v2Handler(fewer, { [SHOT_PROBLEM]: 'newer b' }), async (api) => {
    expect((await runPull(api, outDir)).code).toBe(0);
  });
  expect(readdirSync(path.join(bundle, 'screenshots'))).toEqual([SHOT_PROBLEM]);
  expect(readFileSync(path.join(bundle, 'screenshots', SHOT_PROBLEM), 'utf8')).toBe('newer b');
  expect(readdirSync(outDir).filter(name => name.startsWith('feedback-v2'))).toEqual(['feedback-v2']);
});

it('Feedback v2 pull: an old bundle left aside by an interrupted run is put back, even when the next pull cannot reach the server', async () => {
  const aside = path.join(outDir, 'feedback-v2.previous');
  mkdirSync(aside, { recursive: true });
  writeFileSync(path.join(aside, 'SUMMARY.md'), 'previous bundle marker');
  await withServer((_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' }).end('{"success":false}');
    return true;
  }, async (api) => {
    expect((await runPull(api, outDir)).code).not.toBe(0);
  });
  expect(readFileSync(path.join(outDir, 'feedback-v2', 'SUMMARY.md'), 'utf8')).toBe('previous bundle marker');
  expect(existsSync(aside)).toBe(false);
});

it('Feedback v2 defect 8: the version 1 digest and JSON come from the same data when a tester submits during the pull', async () => {
  let jsonReads = 0;
  let mdReads = 0;
  const v1 = (n: number) => JSON.stringify({ count: n, submissions: Array.from({ length: n }, (_, i) => ({ id: `sub-${i + 1}`, payload: {} })) });
  const handler: Handler = (req, res) => {
    if (req.url === '/api/v1/feedback/export.json?limit=5000') {
      jsonReads += 1;
      // First read sees 1 submission; a tester submits before the digest is built.
      res.writeHead(200, { 'content-type': 'application/json' }).end(v1(jsonReads === 1 ? 1 : 2));
      return true;
    }
    if (req.url === '/api/v1/feedback/export.md?limit=5000') {
      mdReads += 1;
      res.writeHead(200, { 'content-type': 'text/markdown' }).end('# digest with 2 submissions');
      return true;
    }
    return false;
  };
  await withServer(handler, async (api) => {
    const result = await runPull(api, outDir);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Version 2 bundle: this server does not have it (404), skipped.');
  });
  expect(jsonReads).toBe(4);
  expect(mdReads).toBe(2);
  expect(JSON.parse(readFileSync(path.join(outDir, 'FEEDBACK-INBOX.json'), 'utf8')).count).toBe(2);
  expect(readFileSync(path.join(outDir, 'FEEDBACK-INBOX.md'), 'utf8')).toBe('# digest with 2 submissions');
  // The version 1 screenshots folder carries its own "ignore everything" rule, for --out-dir inside the repo.
  expect(readFileSync(path.join(outDir, 'feedback-screenshots', '.gitignore'), 'utf8')).toMatch(/^\*$/m);
});
